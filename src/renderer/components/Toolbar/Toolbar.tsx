import styles from './Toolbar.module.css';
import { Button } from '../common/ui';
import {
  FilterPositiveIcon,
  FolderOpenIcon,
  GearIcon,
  PauseIcon,
  PlayIcon,
  SaveIcon,
  SidebarIcon,
  StopIcon,
  TerminalMarkIcon,
  TrashIcon
} from '../../lib/icons';
import { DeviceSelectorControl } from '../DeviceSelector/DeviceSelector';
import { useDeviceStore, useSelectedDevice } from '../../state/deviceStore';
import { useLogStore } from '../../state/logStore';
import { useUiStore } from '../../state/uiStore';
import { saveLogAsFile } from '../../lib/saveLog';
import { openLogFilesWithProgress, currentFilterConfig } from '../../lib/openLogFiles';

export function Toolbar() {
  const captureState = useDeviceStore((s) => s.captureState);
  const selectedDevice = useSelectedDevice();
  const setCaptureState = useDeviceStore((s) => s.setCaptureState);
  const setError = useDeviceStore((s) => s.setError);
  const entries = useLogStore((s) => s.entries);
  const clearLog = useLogStore((s) => s.clear);
  const sidebarVisible = useUiStore((s) => s.sidebarVisible);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const openSettingsDialog = useUiStore((s) => s.openSettingsDialog);
  const fileOpenProgress = useUiStore((s) => s.fileOpenProgress);
  const opening = fileOpenProgress !== null;

  const isCapturing = captureState === 'capturing';
  const isPaused = captureState === 'paused';
  // selectedDevice can be a cached, offline "ghost" entry for a device that's
  // dropped off adb's live list but is still selected (see useSelectedDevice)
  // — Start must stay disabled for that until it actually reconnects.
  const canStart = selectedDevice?.state === 'device' && (captureState === 'idle' || captureState === 'error');
  const canPause = isCapturing;
  const canStop = isCapturing || isPaused || captureState === 'reconnecting';

  async function handleStart() {
    if (!selectedDevice) return;
    try {
      await window.api.capture.start(selectedDevice.serial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start capture');
    }
  }

  async function handlePauseResume() {
    if (isPaused) {
      await window.api.capture.resume();
    } else {
      await window.api.capture.pause();
    }
  }

  async function handleStop() {
    await window.api.capture.stop();
    setCaptureState('idle');
  }

  function handleClear() {
    clearLog();
  }

  async function handleClearDeviceToo() {
    if (!selectedDevice) return;
    const confirmed = window.confirm(
      `Also clear ${selectedDevice.model}'s logcat buffer? Other tools reading this device's log will lose history too.`
    );
    if (!confirmed) return;
    clearLog();
    await window.api.capture.clearDeviceBuffer(selectedDevice.serial);
  }

  async function handleOpen() {
    const paths = await window.api.files.showOpenLogDialog();
    if (!paths) return;
    clearLog();
    try {
      await openLogFilesWithProgress(paths);
    } catch (err) {
      window.alert(`Could not open the selected file — ${err instanceof Error ? err.message : 'it may be unreadable.'}`);
    }
  }

  async function handleOpenWithFilter() {
    const paths = await window.api.files.showOpenLogDialog();
    if (!paths) return;
    clearLog();
    try {
      await openLogFilesWithProgress(paths, currentFilterConfig());
    } catch (err) {
      window.alert(`Could not open the selected file — ${err instanceof Error ? err.message : 'it may be unreadable.'}`);
    }
  }

  async function handleSaveLog() {
    await saveLogAsFile(entries);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.brand}>
        <div className={styles.logoMark}>
          <TerminalMarkIcon size={15} color="#cfe8ff" />
        </div>
        <span className={styles.brandTitle}>LogCat Viewer</span>
      </div>

      <Button
        onClick={toggleSidebar}
        variant={sidebarVisible ? 'active' : 'plain'}
        title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
        // Nudged right so the divider right after this button lines up with the
        // sidebar's own right border at its default width — purely a visual
        // alignment tweak, not tied to the (resizable) sidebar width live.
        style={{ padding: 6, marginLeft: 13 }}
      >
        <SidebarIcon size={16} />
      </Button>

      <div className={styles.divider} />

      <DeviceSelectorControl />

      <div className={styles.divider} />

      <Button onClick={handleStart} disabled={!canStart} title="Start capture">
        <PlayIcon size={15} />
        Start
      </Button>
      <Button onClick={handlePauseResume} disabled={!canPause && !isPaused} variant={isPaused || isCapturing ? 'active' : 'plain'} title="Pause capture">
        <PauseIcon size={15} />
        {isPaused ? 'Resume' : 'Pause'}
      </Button>
      <Button onClick={handleStop} disabled={!canStop} title="Stop capture">
        <StopIcon size={15} />
        Stop
      </Button>

      <div className={styles.divider} />

      <Button onClick={handleClear} onContextMenu={(e) => { e.preventDefault(); handleClearDeviceToo(); }} title="Clear view (right-click: also clear device buffer)">
        <TrashIcon size={15} />
        Clear
      </Button>

      <div className={styles.divider} />

      <Button onClick={handleOpen} disabled={opening} title="Open a saved log file">
        <FolderOpenIcon size={15} />
        {opening ? `Opening… ${fileOpenProgress}%` : 'Open'}
      </Button>
      <Button
        onClick={handleOpenWithFilter}
        disabled={opening}
        title="Open a log file, keeping only lines that match your current filters — a much higher size limit than Open"
      >
        <FilterPositiveIcon size={14} />
        Open With Filter
      </Button>
      <Button onClick={handleSaveLog} disabled={entries.length === 0} title="Save the captured log to a .log file">
        <SaveIcon size={15} />
        Save
      </Button>

      <div className={styles.spacer} />

      <Button onClick={openSettingsDialog} title="Settings" style={{ padding: 6 }}>
        <GearIcon size={17} />
      </Button>

      {opening && (
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${fileOpenProgress}%` }} />
        </div>
      )}
    </div>
  );
}
