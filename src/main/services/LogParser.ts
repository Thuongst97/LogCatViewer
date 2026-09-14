// Parses `adb logcat -v threadtime` output into LogEntry records.
//
// threadtime format: "MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG: message"
// `-v year` prepends a four-digit year to that date ("2026-09-14 …"), which
// is common in saved/exported logs even when the rest of the line is
// identical — so the year is matched optionally rather than being a second
// pattern. Without that, a year-stamped file matched on *zero* lines and
// opened as an empty log, since every line fell through to the
// "unheadered continuation" path below and got dropped as pre-header noise.
// Real devices repeat this full header on every physical line, even for a
// multi-line stack trace (e.g. every frame of a FATAL EXCEPTION dump is its
// own fully-headered line) — those become separate LogEntry rows, matching
// how Android Studio's Logcat treats them. The one case where a *second*
// physical line has no header is a single log call whose message string
// itself contains an embedded "\n" (logcat prints the header once, then the
// raw message including the newline) — that's what `continuation` captures,
// and it feeds the "Stack Trace" detail-inspector tab. It will often be
// empty, and that's expected.
//
// No Electron dependency here on purpose: this file is unit-tested directly
// (see tests/unit/LogParser.test.ts) without needing to mock Electron.
import type { LogEntry, LogLevel } from '@shared/types';

const LINE_PATTERN =
  /^(?:(\d{4})-)?(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+([^:]*?):\s?(.*)$/;

export class LogParser {
  private buffer = '';
  private current: LogEntry | null = null;
  private currentTouchedAt = 0;
  private finished: LogEntry[] = [];
  private nextId: number;

  constructor(
    private readonly deviceId: string,
    startId = 1
  ) {
    this.nextId = startId;
  }

  /** Feed a raw chunk of stdout text (may be a partial line, or contain many lines). */
  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    // The final element may be an incomplete line with no trailing "\n" yet — keep it buffered.
    this.buffer = lines.pop() ?? '';
    for (const rawLine of lines) this.consumeLine(rawLine);
  }

  private consumeLine(rawLine: string): void {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0) return;

    const match = LINE_PATTERN.exec(line);
    if (match) {
      this.finalizeCurrent();
      const [, year, monthDay, time, pidStr, tidStr, level, tagRaw, message] = match;
      this.current = {
        id: this.nextId++,
        // Keep the year when the log carries one — it's real information, it
        // shows in the detail dialog, and it keeps a multi-file merge sorting
        // correctly across a year boundary.
        date: year ? `${year}-${monthDay}` : monthDay,
        time,
        pid: Number(pidStr),
        tid: Number(tidStr),
        level: level as LogLevel,
        tag: tagRaw.trim(),
        message,
        continuation: [],
        raw: line,
        deviceId: this.deviceId
      };
      this.currentTouchedAt = Date.now();
      return;
    }

    if (this.current) {
      this.current.continuation.push(line);
      this.current.raw += `\n${line}`;
      this.currentTouchedAt = Date.now();
    }
    // else: pre-header noise (e.g. "--------- beginning of main") — dropped.
  }

  private finalizeCurrent(): void {
    if (this.current) {
      this.finished.push(this.current);
      this.current = null;
    }
  }

  /**
   * Force-finalize the in-progress entry if it hasn't been touched in `staleMs`.
   * Called periodically by AdbService's batch timer so the very last line of a
   * burst isn't stuck invisible while waiting for a next line that may not
   * arrive for a while.
   */
  flushStale(staleMs: number): void {
    if (this.current && Date.now() - this.currentTouchedAt >= staleMs) {
      this.finalizeCurrent();
    }
  }

  /** Finalize whatever is in progress — call when the stream ends (capture stopped). */
  flushAll(): void {
    this.finalizeCurrent();
  }

  /** Drain and return every entry finalized since the last call to drain(). */
  drain(): LogEntry[] {
    if (this.finished.length === 0) return [];
    const out = this.finished;
    this.finished = [];
    return out;
  }
}
