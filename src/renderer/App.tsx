import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar/Toolbar';
import { FilterSidebar } from './components/FilterSidebar/FilterSidebar';
import { SearchBar } from './components/SearchBar/SearchBar';
import { LogTable } from './components/LogTable/LogTable';
import { SearchResultsDock } from './components/SearchResultsDock/SearchResultsDock';
import { FilterEditorDialog } from './components/FilterEditorDialog/FilterEditorDialog';
import { ExportDialog } from './components/ExportDialog/ExportDialog';
import { SettingsDialog } from './components/SettingsDialog/SettingsDialog';
import { LogDetailDialog } from './components/LogDetailDialog/LogDetailDialog';
import { useLogStore } from './state/logStore';
import { useFilterStore } from './state/filterStore';
import { useDeviceStore } from './state/deviceStore';
import { useTableSettingsStore } from './state/tableSettingsStore';
import { useUiStore, applyThemeToDocument, type EffectiveTheme } from './state/uiStore';
import { getSystemTheme } from './lib/theme';
import { saveLogAsFile } from './lib/saveLog';
import type { AppSettings, ThemePreference } from '@shared/types';

export default function App() {
  const appendBatch = useLogStore((s) => s.appendBatch);
  const clearLog = useLogStore((s) => s.clear);
  const setDevices = useDeviceStore((s) => s.setDevices);
  const setCaptureState = useDeviceStore((s) => s.setCaptureState);
  const setError = useDeviceStore((s) => s.setError);
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const setEffectiveTheme = useUiStore((s) => s.setEffectiveTheme);
  const effectiveTheme = useUiStore((s) => s.effectiveTheme);
  const activeDialog = useUiStore((s) => s.activeDialog);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const toggleSearchResults = useUiStore((s) => s.toggleSearchResults);
  const sidebarVisible = useUiStore((s) => s.sidebarVisible);
  const openExportDialog = useUiStore((s) => s.openExportDialog);
  const openSettingsDialog = useUiStore((s) => s.openSettingsDialog);

  // Initial load: settings (theme, table display prefs), device list.
  useEffect(() => {
    window.api.settings.get().then((settings: AppSettings) => {
      setThemePreference(settings.theme);
      const resolved: EffectiveTheme = settings.theme === 'system' ? getSystemTheme() : settings.theme;
      setEffectiveTheme(resolved);
      applyThemeToDocument(resolved);
      useTableSettingsStore.getState().hydrate(settings.table);
    });
    window.api.devices.list().then(setDevices);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live subscriptions to main-process events.
  useEffect(() => {
    const offDevices = window.api.devices.onChanged(setDevices);
    const offBatch = window.api.capture.onLogBatch(appendBatch);
    const offState = window.api.capture.onStateChanged((state) => setCaptureState(state as never));
    const offError = window.api.capture.onError((message) => setError(message));
    return () => {
      offDevices();
      offBatch();
      offState();
      offError();
    };
  }, [appendBatch, setDevices, setCaptureState, setError]);

  // Application-menu commands (see main/menu.ts + preload's menuEvents bridge).
  useEffect(() => {
    const off = window.menuEvents.onCommand((command) => {
      switch (command) {
        case 'capture:clear':
          clearLog();
          break;
        case 'capture:start': {
          const serial = useDeviceStore.getState().selectedSerial;
          if (serial) window.api.capture.start(serial);
          break;
        }
        case 'capture:stop':
          window.api.capture.stop();
          break;
        case 'capture:toggle-pause': {
          const state = useDeviceStore.getState().captureState;
          if (state === 'paused') window.api.capture.resume();
          else if (state === 'capturing') window.api.capture.pause();
          break;
        }
        case 'view:toggle-sidebar':
          toggleSidebar();
          break;
        case 'view:toggle-search-results':
          toggleSearchResults();
          break;
        case 'file:export':
          openExportDialog();
          break;
        case 'file:settings':
          openSettingsDialog();
          break;
        case 'file:open-log':
          window.api.files.openLogDialog().then((result) => {
            if (!result) return;
            clearLog();
            useLogStore.getState().appendBatch(result.entries);
          });
          break;
        case 'file:save-log':
          saveLogAsFile(useLogStore.getState().entries);
          break;
        case 'file:open-project':
          window.api.files.openProjectDialog().then((project) => {
            if (project) useFilterStore.getState().loadFilters(project.filters);
          });
          break;
        case 'file:save-project':
          window.api.files.saveProjectDialog('LogCat Viewer Project').then((path) => {
            if (!path) return;
            window.api.files.saveProject(path, {
              name: 'LogCat Viewer Project',
              createdAt: new Date().toISOString(),
              modifiedAt: new Date().toISOString(),
              filters: useFilterStore.getState().filters
            });
          });
          break;
        case 'view:toggle-theme': {
          const next: ThemePreference = effectiveTheme === 'dark' ? 'light' : 'dark';
          setThemePreference(next);
          setEffectiveTheme(next);
          applyThemeToDocument(next);
          window.api.settings.set({ theme: next });
          break;
        }
        default:
          break;
      }
    });
    return off;
  }, [clearLog, toggleSidebar, toggleSearchResults, openExportDialog, openSettingsDialog, effectiveTheme, setThemePreference, setEffectiveTheme]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Toolbar />
      <div style={{ flexGrow: 1, display: 'flex', minHeight: 0 }}>
        {sidebarVisible && <FilterSidebar />}
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <SearchBar />
          <LogTable />
        </div>
      </div>
      <SearchResultsDock />

      {activeDialog === 'filterEditor' && <FilterEditorDialog />}
      {activeDialog === 'export' && <ExportDialog />}
      {activeDialog === 'settings' && <SettingsDialog />}
      {activeDialog === 'logDetail' && <LogDetailDialog />}
    </div>
  );
}
