import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import type { CaptureState, Device, DeviceState, LogEntry } from '@shared/types';
import { LogParser } from './LogParser';

const execFileAsync = promisify(execFile);

const BATCH_INTERVAL_MS = 40;
const STALE_ENTRY_MS = 250;
const MAX_PAUSED_BACKLOG = 200_000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15_000;

/**
 * Owns the adb subprocess lifecycle: device discovery (`adb track-devices`)
 * and log capture (`adb logcat -v threadtime`) for one active device at a
 * time. Emits typed events consumed by ipc/registerIpcHandlers.ts and
 * forwarded to the renderer. See IMPLEMENTATION_PLAN.md §7–8.
 */
export class AdbService extends EventEmitter {
  private adbPath: string;

  private trackProcess: ChildProcessWithoutNullStreams | null = null;
  private trackBuffer: Buffer = Buffer.alloc(0);
  /** True if the most recently received raw chunk ended in an unresolved "\r"
   *  whose pairing "\n" (or lack of one) hasn't arrived yet — see handleTrackChunk. */
  private trackPendingCR = false;
  private devices: Device[] = [];

  private logProcess: ChildProcessWithoutNullStreams | null = null;
  private parser: LogParser | null = null;
  private batchTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;

  private currentSerial: string | null = null;
  private paused = false;
  private intentionalStop = true;
  private pausedBacklog: LogEntry[] = [];
  private nextEntryId = 1;

  constructor(adbPath: string) {
    super();
    this.adbPath = adbPath;
  }

  setAdbPath(path: string): void {
    this.adbPath = path;
  }

  /** Best-effort search for adb on common Windows install locations, then PATH. */
  static async autoDetect(): Promise<string | null> {
    const candidates: string[] = [];
    const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (sdkRoot) {
      candidates.push(join(sdkRoot, 'platform-tools', 'adb.exe'), join(sdkRoot, 'platform-tools', 'adb'));
    }
    if (process.env.LOCALAPPDATA) {
      candidates.push(join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'));
    }
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    try {
      await execFileAsync('adb', ['version']);
      return 'adb'; // resolvable via PATH
    } catch {
      return null;
    }
  }

  /** One-shot snapshot, used to answer the initial `devices:list` IPC call immediately. */
  async listDevicesOnce(): Promise<Device[]> {
    try {
      const { stdout } = await execFileAsync(this.adbPath, ['devices', '-l']);
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('List of devices attached'));
      const devices = lines.map(parseDeviceLine);
      this.devices = devices;
      return devices;
    } catch {
      return [];
    }
  }

  /** Starts the long-lived `adb track-devices` process for live device list updates. */
  startTrackingDevices(): void {
    if (this.trackProcess) return;
    const proc = spawn(this.adbPath, ['track-devices', '-l']);
    this.trackProcess = proc;

    proc.stdout.on('data', (chunk: Buffer) => this.handleTrackChunk(chunk));
    proc.on('error', (err: Error) => {
      this.emit('captureError', `Device tracking failed to start: ${err.message}`);
    });
    proc.on('exit', () => {
      this.trackProcess = null;
    });
  }

  stopTrackingDevices(): void {
    this.trackProcess?.kill();
    this.trackProcess = null;
  }

  /**
   * `adb track-devices -l` speaks the raw adb host protocol, not the plain-text
   * format `adb devices -l` prints for a one-shot call: every device-list update
   * arrives as a 4-ASCII-hex-digit byte length immediately followed by exactly
   * that many bytes of device lines (one per device, no "List of devices
   * attached" header, and no blank line separating one update from the next —
   * the next update's length prefix starts right where this one's payload
   * ends). A parser expecting the `adb devices -l` text shape never sees a
   * frame boundary and silently never emits an update after the first snapshot
   * — device connects/disconnects that happen while the app is running would
   * never reach the renderer, leaving the toolbar's device indicator stuck at
   * whatever it last showed.
   *
   * On Windows, adb.exe's own CRT stdio additionally rewrites every internal
   * "\n" to "\r\n" on the way out, but the length prefix was computed against
   * the original, un-translated bytes — so the raw bytes we receive run one
   * byte longer per line than their declared length says, desyncing every
   * frame after the first unless corrected. Normalizing CRLF -> LF before
   * framing restores byte-for-byte alignment with those declared lengths
   * (verified against a real captured `adb track-devices -l` session).
   *
   * A raw chunk can end in a lone "\r" whose pairing "\n" hasn't arrived yet
   * (Node delivers pipe data in arbitrary-sized chunks, so this split can
   * land anywhere). Normalizing eagerly here would either wrongly collapse it
   * or wrongly leave it un-collapsed depending on what the *next* chunk turns
   * out to start with — either way, wrong every other time. That trailing
   * "\r" is held back (`trackPendingCR`) instead and re-prepended to the next
   * chunk before normalizing again, so CRLF pairs split across chunk
   * boundaries are still resolved correctly regardless of chunk size.
   */
  private handleTrackChunk(chunk: Buffer): void {
    let raw = chunk;
    if (this.trackPendingCR) {
      raw = Buffer.concat([Buffer.from('\r', 'latin1'), raw]);
      this.trackPendingCR = false;
    }
    if (raw.length > 0 && raw[raw.length - 1] === 0x0d) {
      this.trackPendingCR = true;
      raw = raw.subarray(0, raw.length - 1);
    }
    const normalizedChunk = Buffer.from(raw.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
    this.trackBuffer = Buffer.concat([this.trackBuffer, normalizedChunk]);

    for (;;) {
      if (this.trackBuffer.length < 4) return;
      const length = parseInt(this.trackBuffer.subarray(0, 4).toString('ascii'), 16);
      if (Number.isNaN(length)) {
        this.trackBuffer = Buffer.alloc(0); // unexpected stream shape — drop rather than spin forever
        return;
      }
      if (this.trackBuffer.length < 4 + length) return; // rest of this frame hasn't arrived yet
      const payload = this.trackBuffer.subarray(4, 4 + length).toString('utf8');
      this.trackBuffer = this.trackBuffer.subarray(4 + length);
      const devices = payload
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map(parseDeviceLine);
      this.devices = devices;
      this.emit('devices', devices);
    }
  }

  getCachedDevices(): Device[] {
    return this.devices;
  }

  // ---- Capture lifecycle -------------------------------------------------

  async startCapture(serial: string): Promise<void> {
    this.killLogProcess();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.currentSerial = serial;
    this.intentionalStop = false;
    this.paused = false;
    this.reconnectAttempt = 0;
    this.parser = new LogParser(serial, this.nextEntryId);
    this.emit('captureState', 'starting' satisfies CaptureState);

    const proc = spawn(this.adbPath, ['-s', serial, 'logcat', '-v', 'threadtime']);
    this.logProcess = proc;

    proc.stdout.on('data', (chunk: Buffer) => {
      this.parser?.feed(chunk.toString('utf8'));
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim();
      if (message) this.emit('captureError', message);
    });
    proc.on('error', (err: Error) => {
      this.emit('captureError', `Failed to start adb logcat: ${err.message}`);
      this.emit('captureState', 'error' satisfies CaptureState);
    });
    proc.on('exit', () => {
      if (this.logProcess === proc) this.logProcess = null;
      if (this.currentSerial !== serial) return; // superseded by a newer capture
      if (this.intentionalStop) {
        this.emit('captureState', 'idle' satisfies CaptureState);
        return;
      }
      this.emit('captureState', 'reconnecting' satisfies CaptureState);
      this.scheduleReconnect(serial);
    });

    this.startBatchTimer();
    this.emit('captureState', 'capturing' satisfies CaptureState);
  }

  private scheduleReconnect(serial: string): void {
    this.reconnectAttempt += 1;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      if (this.currentSerial === serial && !this.intentionalStop) {
        this.startCapture(serial).catch((err: Error) => this.emit('captureError', err.message));
      }
    }, delay);
  }

  pause(): void {
    if (!this.currentSerial) return;
    this.paused = true;
    this.emit('captureState', 'paused' satisfies CaptureState);
  }

  resume(): void {
    if (!this.currentSerial) return;
    this.paused = false;
    if (this.pausedBacklog.length > 0) {
      this.emit('logBatch', this.pausedBacklog);
      this.pausedBacklog = [];
    }
    this.emit('captureState', 'capturing' satisfies CaptureState);
  }

  stop(): void {
    this.intentionalStop = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.killLogProcess();
    this.stopBatchTimer();
    this.parser = null;
    this.currentSerial = null;
    this.paused = false;
    this.pausedBacklog = [];
    this.emit('captureState', 'idle' satisfies CaptureState);
  }

  private killLogProcess(): void {
    if (this.logProcess) {
      this.logProcess.removeAllListeners('exit');
      this.logProcess.kill();
      this.logProcess = null;
    }
  }

  async clearDeviceBuffer(serial: string): Promise<void> {
    await execFileAsync(this.adbPath, ['-s', serial, 'logcat', '-c']);
  }

  private startBatchTimer(): void {
    if (this.batchTimer) return;
    this.batchTimer = setInterval(() => {
      if (!this.parser) return;
      this.parser.flushStale(STALE_ENTRY_MS);
      const entries = this.parser.drain();
      if (entries.length === 0) return;
      this.nextEntryId += entries.length;
      if (this.paused) {
        this.pausedBacklog.push(...entries);
        if (this.pausedBacklog.length > MAX_PAUSED_BACKLOG) {
          this.pausedBacklog.splice(0, this.pausedBacklog.length - MAX_PAUSED_BACKLOG);
        }
      } else {
        this.emit('logBatch', entries);
      }
    }, BATCH_INTERVAL_MS);
  }

  private stopBatchTimer(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  dispose(): void {
    this.stop();
    this.stopTrackingDevices();
  }
}

function parseDeviceLine(line: string): Device {
  const parts = line.trim().split(/\s+/);
  const [serial, state] = parts;
  const rest = parts.slice(2).join(' ');
  const modelMatch = rest.match(/model:(\S+)/);
  return {
    serial,
    state: (state as DeviceState) ?? 'offline',
    model: modelMatch ? modelMatch[1].replace(/_/g, ' ') : serial
  };
}
