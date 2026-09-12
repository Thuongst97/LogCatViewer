import Store from 'electron-store';
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types';

/** Thin wrapper around electron-store so the rest of main/ never touches the store directly. */
export class SettingsService {
  private store: Store<AppSettings>;

  constructor() {
    this.store = new Store<AppSettings>({
      name: 'config',
      defaults: DEFAULT_SETTINGS
    });
  }

  get(): AppSettings {
    return {
      theme: this.store.get('theme'),
      adbPath: this.store.get('adbPath'),
      bufferCapacity: this.store.get('bufferCapacity'),
      recentDeviceSerials: this.store.get('recentDeviceSerials'),
      recentProjectPaths: this.store.get('recentProjectPaths'),
      autoscroll: this.store.get('autoscroll'),
      table: this.store.get('table'),
      filters: this.store.get('filters')
    };
  }

  set(patch: Partial<AppSettings>): AppSettings {
    for (const [key, value] of Object.entries(patch)) {
      this.store.set(key as keyof AppSettings, value as never);
    }
    return this.get();
  }

  rememberDevice(serial: string): void {
    const recent = this.store.get('recentDeviceSerials').filter((s) => s !== serial);
    recent.unshift(serial);
    this.store.set('recentDeviceSerials', recent.slice(0, 10));
  }

  rememberProjectPath(path: string): void {
    const recent = this.store.get('recentProjectPaths').filter((p) => p !== path);
    recent.unshift(path);
    this.store.set('recentProjectPaths', recent.slice(0, 10));
  }
}
