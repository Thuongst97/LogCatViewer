import { useEffect, useRef, useState } from 'react';
import styles from './DeviceSelector.module.css';
import { CheckIcon, ChevronDownIcon, PhoneIcon, RefreshIcon, SearchIcon } from '../../lib/icons';
import { useDeviceStore, useSelectedDevice } from '../../state/deviceStore';
import type { Device } from '@shared/types';

/** Toolbar trigger + anchored popover for picking the active ADB device (mirrors DeviceSelector.dc.html). */
export function DeviceSelectorControl() {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const devices = useDeviceStore((s) => s.devices);
  const selectedSerial = useDeviceStore((s) => s.selectedSerial);
  const selectDevice = useDeviceStore((s) => s.selectDevice);
  const setDevices = useDeviceStore((s) => s.setDevices);
  // Falls back to last-known info (shown offline) when the selected device has
  // dropped out of adb's live list — see useSelectedDevice for why, instead of
  // just deriving from the current `devices` array like the dropdown list does.
  const selected = useSelectedDevice();

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  async function handleRefresh() {
    await window.api.devices.refresh();
    const latest = await window.api.devices.list();
    setDevices(latest);
  }

  const filtered = devices.filter(
    (d) => d.model.toLowerCase().includes(filterText.toLowerCase()) || d.serial.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button className={[styles.trigger, open ? styles.triggerOpen : ''].join(' ')} onClick={() => setOpen((v) => !v)}>
        <PhoneIcon size={15} color="var(--text-secondary)" />
        {selected ? (
          <span>
            {selected.model} <span className={styles.deviceLabel}>&middot;</span> <span className={styles.deviceLabel}>{selected.serial}</span>
          </span>
        ) : (
          <span className={styles.deviceLabel}>No device selected</span>
        )}
        <span className={[styles.dot, selected?.state === 'device' ? styles.dotOnline : styles.dotOffline].join(' ')} />
        <ChevronDownIcon size={14} color={open ? 'var(--accent)' : 'var(--text-secondary)'} style={open ? { transform: 'rotate(180deg)' } : undefined} />
      </button>

      {open && (
        <div className={styles.popover}>
          <div className={styles.searchRow}>
            <div style={{ position: 'relative' }}>
              <SearchIcon size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 9, top: 9 }} />
              <input
                autoFocus
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter devices…"
                style={{
                  height: 30,
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 5,
                  paddingLeft: 28,
                  fontSize: 12,
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          </div>

          <div className={styles.list}>
            {filtered.length === 0 && <div className={styles.empty}>No devices found. Is USB debugging enabled?</div>}
            {filtered.map((device) => (
              <DeviceRow
                key={device.serial}
                device={device}
                selected={device.serial === selectedSerial}
                onClick={() => {
                  if (device.state !== 'device') return;
                  selectDevice(device.serial);
                  setOpen(false);
                }}
              />
            ))}
          </div>

          <div className={styles.footer}>
            <button className={styles.refresh} onClick={handleRefresh}>
              <RefreshIcon size={13} />
              Refresh
            </button>
            <span className={styles.adbStatus}>adb tracking devices</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DeviceRow({ device, selected, onClick }: { device: Device; selected: boolean; onClick: () => void }) {
  const online = device.state === 'device';
  return (
    <button
      className={[styles.deviceRow, selected ? styles.deviceRowSelected : '', online ? '' : styles.deviceRowOffline].join(' ')}
      onClick={onClick}
      disabled={!online}
    >
      <PhoneIcon size={16} color={selected ? 'var(--accent-text)' : 'var(--text-secondary)'} />
      <div className={styles.deviceInfo}>
        <div className={styles.deviceName}>{device.model}</div>
        <div className={styles.deviceMeta} style={{ fontFamily: 'var(--font-mono)' }}>
          {device.serial} {device.androidVersion ? `· Android ${device.androidVersion}` : online ? '' : '· offline'}
        </div>
      </div>
      <span className={[styles.dot, online ? styles.dotOnline : styles.dotOffline].join(' ')} />
      {selected && <CheckIcon size={14} color="var(--accent-text)" />}
    </button>
  );
}
