import { dialog, type BrowserWindow } from 'electron';
import { createWriteStream } from 'node:fs';
import type { ExportFormat, ExportOptions, LogEntry } from '@shared/types';

const LEVEL_COLOR: Record<string, string> = {
  V: '#8b9099',
  D: '#5ec8f8',
  I: '#6fcf7d',
  W: '#f5b942',
  E: '#f56c6c',
  F: '#ff4d6d',
  S: '#8b9099'
};

const FORMAT_EXTENSION: Record<ExportFormat, string> = {
  text: 'txt',
  json: 'json',
  csv: 'csv',
  raw: 'log',
  html: 'html'
};

/** Native save-path picker plus streamed file writers for each export format (see plan §15). */
export class ExportService {
  async showSaveDialog(window: BrowserWindow, suggestedName: string, format: ExportFormat): Promise<string | null> {
    const ext = FORMAT_EXTENSION[format];
    const result = await dialog.showSaveDialog(window, {
      title: 'Export Log',
      defaultPath: `${suggestedName}.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }]
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  }

  async run(options: ExportOptions, entries: LogEntry[]): Promise<void> {
    const stream = createWriteStream(options.destinationPath, { encoding: 'utf8' });
    try {
      switch (options.format) {
        case 'text':
          await this.writeText(stream, entries, options);
          break;
        case 'csv':
          await this.writeCsv(stream, entries, options);
          break;
        case 'json':
          await this.writeJson(stream, entries);
          break;
        case 'raw':
          await this.writeRaw(stream, entries);
          break;
        case 'html':
          await this.writeHtml(stream, entries, options);
          break;
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
      });
    }
  }

  private async writeText(
    stream: NodeJS.WritableStream,
    entries: LogEntry[],
    options: ExportOptions
  ): Promise<void> {
    if (options.includeHeaders) {
      await writeLine(stream, 'Index  Date   Time            PID    TID    Level  Tag                  Message');
    }
    for (const e of entries) {
      await writeLine(
        stream,
        `${pad(String(e.id), 6)} ${e.date}  ${e.time}  ${pad(String(e.pid), 6)} ${pad(String(e.tid), 6)} ${e.level}      ${pad(e.tag, 20)} ${e.message}`
      );
      for (const line of e.continuation) await writeLine(stream, `                                                              ${line}`);
    }
  }

  private async writeCsv(stream: NodeJS.WritableStream, entries: LogEntry[], options: ExportOptions): Promise<void> {
    const columns = options.onlyVisibleColumns
      ? ['Index', 'Time', 'PID', 'TID', 'Level', 'Tag', 'Message']
      : ['Index', 'Date', 'Time', 'PID', 'TID', 'Level', 'Tag', 'Message', 'DeviceId'];
    if (options.includeHeaders) await writeLine(stream, columns.join(','));
    for (const e of entries) {
      const message = csvEscape([e.message, ...e.continuation].join('\n'));
      const row = options.onlyVisibleColumns
        ? [e.id, e.time, e.pid, e.tid, e.level, csvEscape(e.tag), message]
        : [e.id, e.date, e.time, e.pid, e.tid, e.level, csvEscape(e.tag), message, csvEscape(e.deviceId)];
      await writeLine(stream, row.join(','));
    }
  }

  private async writeJson(stream: NodeJS.WritableStream, entries: LogEntry[]): Promise<void> {
    await write(stream, '[\n');
    for (let i = 0; i < entries.length; i++) {
      const suffix = i < entries.length - 1 ? ',\n' : '\n';
      await write(stream, JSON.stringify(entries[i]) + suffix);
    }
    await write(stream, ']\n');
  }

  private async writeRaw(stream: NodeJS.WritableStream, entries: LogEntry[]): Promise<void> {
    for (const e of entries) await writeLine(stream, e.raw);
  }

  private async writeHtml(stream: NodeJS.WritableStream, entries: LogEntry[], options: ExportOptions): Promise<void> {
    await write(
      stream,
      `<!doctype html><html><head><meta charset="utf-8"><title>LogCat Export</title><style>
body{background:#1a1d23;color:#e6e8eb;font:12px/1.5 "Cascadia Code",Consolas,monospace;margin:0;padding:16px;}
table{border-collapse:collapse;width:100%;}
td,th{padding:3px 8px;text-align:left;white-space:pre-wrap;word-break:break-word;}
th{color:#9aa0a8;font-size:11px;text-transform:uppercase;border-bottom:1px solid #2a2e35;}
tr:nth-child(even){background:rgba(255,255,255,0.02);}
</style></head><body><table>\n`
    );
    if (options.includeHeaders) {
      await write(stream, '<tr><th>Index</th><th>Time</th><th>PID</th><th>TID</th><th>Level</th><th>Tag</th><th>Message</th></tr>\n');
    }
    for (const e of entries) {
      const color = LEVEL_COLOR[e.level] ?? '#e6e8eb';
      const message = [e.message, ...e.continuation].map(escapeHtml).join('<br>');
      await write(
        stream,
        `<tr><td>${e.id}</td><td>${e.time}</td><td>${e.pid}</td><td>${e.tid}</td>` +
          `<td style="color:${color};font-weight:700">${e.level}</td><td>${escapeHtml(e.tag)}</td>` +
          `<td style="color:${color}">${message}</td></tr>\n`
      );
    }
    await write(stream, '</table></body></html>\n');
  }
}

function write(stream: NodeJS.WritableStream, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (err) => (err ? reject(err) : resolve()));
  });
}

function writeLine(stream: NodeJS.WritableStream, line: string): Promise<void> {
  return write(stream, line + '\n');
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
