import { describe, expect, it } from 'vitest';
import { LogParser } from '../../src/main/services/LogParser';

// Note: an entry is only finalized into drain()'s output when the *next* header line
// arrives, or when flushAll()/flushStale() is called explicitly — this mirrors how
// AdbService actually drives the parser (a periodic flushStale on the batch timer).
// So every test below that wants to see the *last* fed entry calls flushAll() first,
// exactly as AdbService does when a capture stops.

describe('LogParser', () => {
  it('parses a single threadtime line into a LogEntry', () => {
    const parser = new LogParser('emulator-5554', 1);
    parser.feed('09-12 14:32:06.845  8421  8421 D MyApp   : onCreate() lifecycle started\n');
    parser.flushAll();
    const entries = parser.drain();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 1,
      date: '09-12',
      time: '14:32:06.845',
      pid: 8421,
      tid: 8421,
      level: 'D',
      tag: 'MyApp',
      message: 'onCreate() lifecycle started',
      deviceId: 'emulator-5554'
    });
  });

  it('parses a year-stamped line (logcat -v year), keeping the year in date', () => {
    // Regression: the pattern only allowed a bare "MM-DD", so a year-stamped
    // log matched on zero lines — every line fell through to the continuation
    // path, got dropped as pre-header noise, and the file opened empty.
    const parser = new LogParser('emulator-5554', 1);
    parser.feed('2026-09-14 06:58:23.331 14216 14935 D CPECallbackController: Dropping carPropertyEvent - propId: 291504647\n');
    parser.flushAll();
    const entries = parser.drain();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      date: '2026-09-14',
      time: '06:58:23.331',
      pid: 14216,
      tid: 14935,
      level: 'D',
      tag: 'CPECallbackController',
      message: 'Dropping carPropertyEvent - propId: 291504647'
    });
  });

  it('parses year-stamped lines with CRLF endings', () => {
    // Exported logs are frequently CRLF; the \r must not end up in the message.
    const parser = new LogParser('emulator-5554', 1);
    parser.feed('2026-09-14 06:58:23.331  2627  2627 D HMG-CPECallbackController: areaId 8\r\n');
    parser.flushAll();
    const [entry] = parser.drain();
    expect(entry.tag).toBe('HMG-CPECallbackController');
    expect(entry.message).toBe('areaId 8');
  });

  it('assigns sequential ids across multiple lines', () => {
    const parser = new LogParser('emulator-5554', 100);
    parser.feed(
      '09-12 14:32:06.845  8421  8421 D MyApp: first\n' + '09-12 14:32:06.900  8421  8421 D MyApp: second\n'
    );
    parser.flushAll();
    const entries = parser.drain();
    expect(entries.map((e) => e.id)).toEqual([100, 101]);
  });

  it('handles a chunk split mid-line by buffering the partial line', () => {
    const parser = new LogParser('emulator-5554', 1);
    parser.feed('09-12 14:32:06.845  8421  8421 D MyA');
    expect(parser.drain()).toHaveLength(0);
    parser.feed('pp: onCreate() lifecycle started\n');
    parser.flushAll();
    const entries = parser.drain();
    expect(entries).toHaveLength(1);
    expect(entries[0].tag).toBe('MyApp');
    expect(entries[0].message).toBe('onCreate() lifecycle started');
  });

  it('folds an unheadered continuation line into the previous entry', () => {
    const parser = new LogParser('emulator-5554', 1);
    parser.feed('09-12 14:32:06.845  8421  8421 D MyApp: first line\nsecond physical line, no header\n');
    parser.feed('09-12 14:32:06.900  8421  8421 D MyApp: a new entry\n');
    parser.flushAll();
    const entries = parser.drain();
    expect(entries).toHaveLength(2);
    expect(entries[0].continuation).toEqual(['second physical line, no header']);
    expect(entries[0].raw).toContain('second physical line, no header');
    expect(entries[1].message).toBe('a new entry');
  });

  it('drops pre-header noise such as the "beginning of main" banner', () => {
    const parser = new LogParser('emulator-5554', 1);
    parser.feed('--------- beginning of main\n09-12 14:32:06.845  8421  8421 I ActivityManager: Displayed\n');
    parser.flushAll();
    const entries = parser.drain();
    expect(entries).toHaveLength(1);
    expect(entries[0].tag).toBe('ActivityManager');
  });

  it('treats every fully-headered line as its own entry (e.g. repeated-header stack frames)', () => {
    const parser = new LogParser('emulator-5554', 1);
    parser.feed(
      '09-12 14:32:09.291  8421  8421 E AndroidRuntime: FATAL EXCEPTION: main\n' +
        '09-12 14:32:09.291  8421  8421 E AndroidRuntime: Process: com.example.myapp, PID: 8421\n'
    );
    parser.flushAll();
    const entries = parser.drain();
    expect(entries).toHaveLength(2);
    expect(entries[0].continuation).toEqual([]);
    expect(entries[1].message).toBe('Process: com.example.myapp, PID: 8421');
  });

  it('flushStale finalizes an in-progress entry after the given threshold', async () => {
    const parser = new LogParser('emulator-5554', 1);
    parser.feed('09-12 14:32:06.845  8421  8421 D MyApp: trailing line with no newline yet\n');
    expect(parser.drain()).toHaveLength(0); // no *next* header arrived yet, so still "current"
    await new Promise((r) => setTimeout(r, 10));
    parser.flushStale(5);
    const entries = parser.drain();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe('trailing line with no newline yet');
  });

  it('flushStale leaves a freshly-touched entry alone', () => {
    const parser = new LogParser('emulator-5554', 1);
    parser.feed('09-12 14:32:06.845  8421  8421 D MyApp: just arrived\n');
    parser.flushStale(5000); // well above how long this test takes to run
    expect(parser.drain()).toHaveLength(0);
  });

  it('flushAll finalizes whatever is pending, e.g. when capture stops', () => {
    const parser = new LogParser('emulator-5554', 1);
    parser.feed('09-12 14:32:06.845  8421  8421 D MyApp: last line\n');
    expect(parser.drain()).toHaveLength(0);
    parser.flushAll();
    expect(parser.drain()).toHaveLength(1);
  });
});
