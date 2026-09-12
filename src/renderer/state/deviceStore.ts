import { create } from 'zustand';
import type { CaptureState, Device } from '@shared/types';

interface DeviceState {
  devices: Device[];
  selectedSerial: string | null;
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
  captureState: 'idle',
  lastError: null,

  setDevices: (devices) => {
    set({ devices });
    const { selectedSerial } = get();
    const stillPresent = devices.some((d) => d.serial === selectedSerial);
    if (!stillPresent) {
      const firstOnline = devices.find((d) => d.state === 'device');
      if (firstOnline) set({ selectedSerial: firstOnline.serial });
    }
  },
  selectDevice: (serial) => set({ selectedSerial: serial }),
  setCaptureState: (state) => set({ captureState: state }),
  setError: (message) => set({ lastError: message })
}));

export function useSelectedDevice(): Device | null {
  return useDeviceStore((s) => s.devices.find((d) => d.serial === s.selectedSerial) ?? null);
}
