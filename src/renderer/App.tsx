import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar/Toolbar';
import { FilterSidebar } from './components/FilterSidebar/FilterSidebar';
import { SearchBar } from './components/SearchBar/SearchBar';
import { LogTable } from './components/LogTable/LogTable';
import { SearchResultsDock } from './components/SearchResultsDock/SearchResultsDock';
import { FilterEditorDialog } from './components/FilterEditorDialog/FilterEditorDialog';
import { SettingsDialog } from './components/SettingsDialog/SettingsDialog';
import { LogDetailDialog } from './components/LogDetailDialog/LogDetailDialog';
import { FileLoadingOverlay } from './components/FileLoadingOverlay/FileLoadingOverlay';
import { useLogStore } from './state/logStore';
import { useFilterStore } from './state/filterStore';
import { useDeviceStore } from './state/deviceStore';
import { useTableSettingsStore } from './state/tableSettingsStore';
import { useUiStore, applyThemeToDocument, LARGE_FILE_OPEN_BYTES, type EffectiveTheme } from './state/uiStore';
import { getSystemTheme } from './lib/theme';
import { saveLogAsFile } from './lib/saveLog';
import { openProjectFile, saveProjectFile } from './lib/projectFile';
import { openLogFilesWithProgress, currentFilterConfig } from './lib/openLogFiles';
import { initVisibleEntries } from './lib/useVisibleEntries';
import type { AppSettings, ThemePreference } from '@shared/types';

export default function App() {
  const appendBatch = useLogStore((s) => s.appendBatch);
  const appendUnboundedBatch = useLogStore((s) => s.appendUnboundedBatch);
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
  const openSettingsDialog = useUiStore((s) => s.openSettingsDialog);
  const fileOpenProgress = useUiStore((s) => s.fileOpenProgress);
  const fileOpenTotalBytes = useUiStore((s) => s.fileOpenTotalBytes);

  // Drives the shared filtered-view computation (see useVisibleEntries.ts) —
  // one subscription for the whole app, not one per component that reads it.
  useEffect(() => {
    initVisibleEntries();
  }, []);

  // Initial load: settings (theme, table display prefs), device list.
  useEffect(() => {
    window.api.settings.get().then((settings: AppSettings) => {
      setThemePreference(settings.theme);
      const resolved: EffectiveTheme = settings.theme === 'system' ? getSystemTheme() : settings.theme;
      setEffectiveTheme(resolved);
      applyThemeToDocument(resolved);
      useTableSettingsStore.getState().hydrate(settings.table);
      // null means "never customized" — keep filterStore's built-in starter filters
      // rather than hydrating an empty list. Uses setState directly (not the
      // loadFilters action) so this read-back doesn't immediately re-persist it.
      if (settings.filters) useFilterStore.setState({ filters: settings.filters });
    });
    window.api.devices.list().then(setDevices);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live subscriptions to main-process events.
  useEffect(() => {
    const offDevices = window.api.devices.onChanged(setDevices);
    const offBatch = window.api.capture.onLogBatch(appendBatch);
    // File-open batches arrive on their own channel and append without ever
    // trimming — see logStore's appendUnboundedBatch for why this must stay
    // structurally separate from the live-capture path above.
    const offOpenBatch = window.api.files.onOpenBatch(appendUnboundedBatch);
    const offState = window.api.capture.onStateChanged((state) => setCaptureState(state as never));
    const offError = window.api.capture.onError((message) => setError(message));
    return () => {
      offDevices();
      offBatch();
      offOpenBatch();
      offState();
      offError();
    };
  }, [appendBatch, appendUnboundedBatch, setDevices, setCaptureState, setError]);

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
        case 'file:settings':
          openSettingsDialog();
          break;
        case 'file:open-log':
          window.api.files.showOpenLogDialog().then((paths) => {
            if (!paths) return;
            clearLog();
            openLogFilesWithProgress(paths).catch((err: Error) => {
              window.alert(`Could not open the selected file — ${err.message || 'it may be unreadable.'}`);
            });
          });
          break;
        case 'file:open-log-filtered':
          window.api.files.showOpenLogDialog().then((paths) => {
            if (!paths) return;
            clearLog();
            openLogFilesWithProgress(paths, currentFilterConfig()).catch((err: Error) => {
              window.alert(`Could not open the selected file — ${err.message || 'it may be unreadable.'}`);
            });
          });
          break;
        case 'file:save-log':
          saveLogAsFile(useLogStore.getState().entries);
          break;
        case 'file:open-project':
          openProjectFile();
          break;
        case 'file:save-project':
          saveProjectFile();
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
  }, [clearLog, toggleSidebar, toggleSearchResults, openSettingsDialog, effectiveTheme, setThemePreference, setEffectiveTheme]);

  // A big file load replaces the table with a loading card rather than
  // rendering rows that are being appended to ~25 times a second — see
  // FileLoadingOverlay for why that churn is what made the window stutter
  // partway through a large load.
  const loadingLargeFile = fileOpenProgress !== null && fileOpenTotalBytes >= LARGE_FILE_OPEN_BYTES;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Toolbar />
      {/* flexBasis 0 throughout this column, not the default `auto` — see
          LogTable.module.css's .tableArea for why an `auto` basis here made
          the Search Results dock get squeezed off the bottom of the window
          once a file grew into the millions of rows. */}
      <div style={{ flexGrow: 1, flexBasis: 0, display: 'flex', minHeight: 0 }}>
        {sidebarVisible && <FilterSidebar />}
        <div style={{ flexGrow: 1, flexBasis: 0, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <SearchBar />
          {loadingLargeFile ? (
            <FileLoadingOverlay percent={fileOpenProgress} totalBytes={fileOpenTotalBytes} />
          ) : (
            <LogTable />
          )}
        </div>
      </div>
      <SearchResultsDock />

      {activeDialog === 'filterEditor' && <FilterEditorDialog />}
      {activeDialog === 'settings' && <SettingsDialog />}
      {activeDialog === 'logDetail' && <LogDetailDialog />}
    </div>
  );
}
