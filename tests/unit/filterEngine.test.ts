import { describe, expect, it } from 'vitest';
import { compileFilters, searchMatches } from '../../src/shared/filterEngine';
import { createEmptyFilter, type LogEntry } from '../../src/shared/types';

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 1,
    date: '09-12',
    time: '14:32:06.845',
    pid: 8421,
    tid: 8421,
    level: 'D',
    tag: 'MyApp',
    message: 'hello world',
    continuation: [],
    raw: 'raw line',
    deviceId: 'emulator-5554',
    ...overrides
  };
}

describe('compileFilters', () => {
  it('shows everything when there are no active filters', () => {
    const compiled = compileFilters([]);
    expect(compiled.isVisible(entry())).toBe(true);
  });

  it('positive filters: entry must match at least one to be visible', () => {
    const positive = createEmptyFilter({ type: 'positive', tag: { value: 'MyApp', enabled: true } });
    const compiled = compileFilters([positive]);
    expect(compiled.isVisible(entry({ tag: 'MyApp' }))).toBe(true);
    expect(compiled.isVisible(entry({ tag: 'OtherApp' }))).toBe(false);
  });

  it('negative filters always win, even over a matching positive filter', () => {
    const positive = createEmptyFilter({ type: 'positive', tag: { value: 'MyApp', enabled: true } });
    const negative = createEmptyFilter({ type: 'negative', message: { value: 'noisy', enabled: true, ignoreCase: true } });
    const compiled = compileFilters([positive, negative]);
    expect(compiled.isVisible(entry({ tag: 'MyApp', message: 'this is noisy chatter' }))).toBe(false);
    expect(compiled.isVisible(entry({ tag: 'MyApp', message: 'quiet' }))).toBe(true);
  });

  it('marker filters never hide anything, only assign a highlight color', () => {
    const marker = createEmptyFilter({ type: 'marker', color: '#ff0000', minLevel: { value: 'E', enabled: true } });
    const compiled = compileFilters([marker]);
    const errorEntry = entry({ level: 'E' });
    const infoEntry = entry({ level: 'I' });
    expect(compiled.isVisible(errorEntry)).toBe(true);
    expect(compiled.isVisible(infoEntry)).toBe(true);
    expect(compiled.rowColor(errorEntry)).toBe('#ff0000');
    expect(compiled.rowColor(infoEntry)).toBeNull();
  });

  it('a matching positive filter also lends its configured color to the row', () => {
    const positive = createEmptyFilter({ type: 'positive', color: '#3d8bef', tag: { value: 'MyApp', enabled: true } });
    const compiled = compileFilters([positive]);
    expect(compiled.rowColor(entry({ tag: 'MyApp' }))).toBe('#3d8bef');
    expect(compiled.rowColor(entry({ tag: 'OtherApp' }))).toBeNull();
  });

  it('a negative filter never lends a color, since it only hides rows', () => {
    const negative = createEmptyFilter({ type: 'negative', color: '#ff0000', tag: { value: 'Noisy', enabled: true } });
    const compiled = compileFilters([negative]);
    // The entry doesn't match, so it's visible — and even if it did match (and got
    // hidden), a negative filter still shouldn't be a source of row color.
    expect(compiled.rowColor(entry({ tag: 'MyApp' }))).toBeNull();
  });

  it('the first matching colorable filter wins when several match', () => {
    const first = createEmptyFilter({ type: 'positive', color: '#111111', minLevel: { value: 'W', enabled: true } });
    const second = createEmptyFilter({ type: 'marker', color: '#222222', tag: { value: 'MyApp', enabled: true } });
    const compiled = compileFilters([first, second]);
    expect(compiled.rowColor(entry({ level: 'E', tag: 'MyApp' }))).toBe('#111111');
  });

  it('the master "Filters Applied" toggle bypasses every filter when off', () => {
    const positive = createEmptyFilter({ type: 'positive', color: '#3d8bef', tag: { value: 'MyApp', enabled: true } });
    const negative = createEmptyFilter({ type: 'negative', tag: { value: 'Other', enabled: true } });
    const compiled = compileFilters([positive, negative], false);
    expect(compiled.isVisible(entry({ tag: 'Other' }))).toBe(true); // would otherwise be hidden
    expect(compiled.isVisible(entry({ tag: 'AnythingElse' }))).toBe(true); // would otherwise fail the positive match
    expect(compiled.rowColor(entry({ tag: 'MyApp' }))).toBeNull(); // would otherwise be colored
  });

  it('inactive filters are ignored entirely', () => {
    const positive = createEmptyFilter({ type: 'positive', active: false, tag: { value: 'MyApp', enabled: true } });
    const compiled = compileFilters([positive]);
    expect(compiled.isVisible(entry({ tag: 'SomethingElse' }))).toBe(true);
  });

  it('minLevel filters by rank, not exact match', () => {
    const warnAndAbove = createEmptyFilter({ type: 'positive', minLevel: { value: 'W', enabled: true } });
    const compiled = compileFilters([warnAndAbove]);
    expect(compiled.isVisible(entry({ level: 'W' }))).toBe(true);
    expect(compiled.isVisible(entry({ level: 'E' }))).toBe(true);
    expect(compiled.isVisible(entry({ level: 'F' }))).toBe(true);
    expect(compiled.isVisible(entry({ level: 'I' }))).toBe(false);
    expect(compiled.isVisible(entry({ level: 'D' }))).toBe(false);
  });

  it('message field supports plain substring and regex modes', () => {
    const regexFilter = createEmptyFilter({
      type: 'positive',
      message: { value: '^HTTP FAILED', enabled: true, regex: true, ignoreCase: false }
    });
    const compiled = compileFilters([regexFilter]);
    expect(compiled.isVisible(entry({ message: 'HTTP FAILED: timeout' }))).toBe(true);
    expect(compiled.isVisible(entry({ message: 'a HTTP FAILED: timeout' }))).toBe(false);
  });

  it('an invalid in-progress regex fails closed rather than throwing', () => {
    const regexFilter = createEmptyFilter({
      type: 'positive',
      message: { value: '(unclosed', enabled: true, regex: true, ignoreCase: true }
    });
    const compiled = compileFilters([regexFilter]);
    expect(() => compiled.isVisible(entry())).not.toThrow();
    expect(compiled.isVisible(entry())).toBe(false);
  });
});

describe('searchMatches', () => {
  it('matches case-insensitively by default', () => {
    expect(searchMatches(entry({ message: 'Hello World' }), 'hello', false, true)).toBe(true);
  });

  it('respects case sensitivity when requested', () => {
    expect(searchMatches(entry({ message: 'Hello World' }), 'hello', false, false)).toBe(false);
  });

  it('supports regex queries', () => {
    expect(searchMatches(entry({ message: 'code=42' }), 'code=\\d+', true, true)).toBe(true);
  });

  it('plain-text mode treats "|" as OR between keywords', () => {
    const wifiEntry = entry({ tag: 'WifiHAL', message: 'scan complete' });
    const hdmiEntry = entry({ tag: 'HdmiControl', message: 'plugged in' });
    const otherEntry = entry({ tag: 'Bluetooth', message: 'paired' });
    expect(searchMatches(wifiEntry, 'WifiHAL|HDMI', false, true)).toBe(true);
    expect(searchMatches(hdmiEntry, 'WifiHAL|HDMI', false, true)).toBe(true);
    expect(searchMatches(otherEntry, 'WifiHAL|HDMI', false, true)).toBe(false);
  });

  it('trims whitespace around "|"-separated terms and ignores empty segments', () => {
    expect(searchMatches(entry({ tag: 'HdmiControl' }), '  WifiHAL  |  HDMI  ', false, true)).toBe(true);
    expect(searchMatches(entry({ tag: 'HdmiControl' }), 'WifiHAL||HDMI', false, true)).toBe(true);
    expect(searchMatches(entry(), '   |   ', false, true)).toBe(false);
  });

  it('a query with no "|" still matches as a single plain substring, unchanged', () => {
    expect(searchMatches(entry({ message: 'Hello World' }), 'Hello', false, true)).toBe(true);
    expect(searchMatches(entry({ message: 'Hello World' }), 'Goodbye', false, true)).toBe(false);
  });

  it('regex mode still uses "|" as real regex alternation, not this plain-text splitting', () => {
    expect(searchMatches(entry({ message: 'code=42' }), 'code=\\d+|status=\\d+', true, true)).toBe(true);
    expect(searchMatches(entry({ message: 'status=200' }), 'code=\\d+|status=\\d+', true, true)).toBe(true);
  });
});
