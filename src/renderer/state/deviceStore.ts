import { create } from 'zustand';
import type { CaptureState, Device } from '@shared/types';

interface DeviceState {
  devices: Device[];
  selectedSerial: string | null;
  /** Last-known info (model, serial) for the selected device, kept around so
   *  the toolbar can keep showing *which* device is selected — with an
   *  offline indicator — when adb's live list momentarily drops it (e.g. a
   *  reboot, a flaky Wi-Fi debugging connection), instead of silently jumping
   *  to whatever other device happens to be online. Refreshed whenever the
   *  selected serial is actually present in a `setDevices` update; never
   *  cleared just because it temporarily isn't — that's what makes selection
   *  "sticky" across a disconnect, so the app is still watching for the same
   *  device to come back rather than needing it re-picked by hand. */
  lastKnownSelectedDevice: Device | null;
  captureState: CaptureState;
  lastError: string | null;

  setDevices: (devices: Device[]) => void;
  selectDevice: (serial: string) => void;
  setCaptureState: (state: CaptureState) => void;
  setError: (message: string | null) => void;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  selectedSerial: null,
  lastKnownSelectedDevice: null,
  captureState: 'idle',
  lastError: null,

  setDevices: (devices) => {
    const { selectedSerial } = get();
    const stillPresent = selectedSerial ? devices.find((d) => d.serial === selectedSerial) : undefined;
    set({ devices, ...(stillPresent ? { lastKnownSelectedDevice: stillPresent } : null) });
  },
  selectDevice: (serial) =>
    set((state) => ({ selectedSerial: serial, lastKnownSelectedDevice: state.devices.find((d) => d.serial === serial) ?? null })),
  setCaptureState: (state) => set({ captureState: state }),
  setError: (message) => set({ lastError: message })
}));

/** The selected device, live if adb currently reports it, otherwise its last
 *  known info shown with a synthetic 'offline' state — see
 *  `lastKnownSelectedDevice` above for why it isn't just null. */
export function useSelectedDevice(): Device | null {
  const live = useDeviceStore((s) => s.devices.find((d) => d.serial === s.selectedSerial));
  const cached = useDeviceStore((s) => s.lastKnownSelectedDevice);
  if (live) return live;
  return cached ? { ...cached, state: 'offline' } : null;
}
