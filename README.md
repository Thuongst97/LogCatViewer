# LogCat Viewer

A Windows desktop application for viewing and analyzing Android `logcat` output, built with Electron + React + TypeScript. The UI and workflow are modeled after **DLT Viewer** — dockable panels, a saved filter list, full-buffer search, and a detailed per-line inspector — but purpose-built for Android's `adb logcat` format instead of the DLT/AUTOSAR protocol.

It can capture live from a connected device/emulator over ADB, or open `.log`/`.txt` files that were captured earlier (including several at once, merged into one chronological timeline).

---

## Features

- **Live capture** — pick a device from the ADB device list (with live connect/disconnect tracking), then Start / Pause / Resume / Stop. Clear the in-app view only, or right-click Clear to also clear the device's own logcat buffer.
- **Saved filters** — a sidebar list of reusable filters, each matching on Tag, PID, Message (plain text or regex, case-sensitive or not), minimum Level, and Process, with a `Positive` / `Negative` / `Marker` type and a custom highlight color. Filters can be toggled individually, or bypassed entirely with the "Filters Enabled/Disabled" switch. Right-click the **Filters** tab for "Select All Filters" / "Unselect All".
- **Quick level toggles** — one-click V/D/I/W/E/F chips in the search bar to hide/show whole severity levels without touching your saved filters.
- **Level-colored log table** — every column (index, time, PID, TID, level, tag, message) is colored by that line's severity, so you can scan for warnings/errors at a glance. Columns are independently resizable and can be shown/hidden; row height and font size are adjustable in Settings.
- **Full-buffer search** — a dedicated, resizable Search Results dock searches the *entire* captured buffer (not just what's currently filtered into view), independent of your saved filters, with the same columns and coloring as the main table. Double-click a result to jump straight to that line in the main view.
- **Log detail dialog** — double-click any row for a full-size popup with Message / Raw Line / Stack Trace tabs and a one-click Copy button; right-click a row for a quick Copy Line / Copy Message / View Full Detail menu.
- **Explore tab** — a lazy-loading folder tree (like Windows Explorer) for browsing the filesystem; double-click a `.log`/`.txt` file to load it directly, or a folder to reveal it in File Explorer.
- **Open / Save logs** — open one or many `.log`/`.txt` files at once (multi-select merges them into a single time-sorted buffer with fresh sequential line numbers), or save the currently captured buffer to a `.log` file.
- **Filter sets as project files** — Save/Load your current filter list to/from a `.lcv.json` project file via the sidebar's Load/Save Filter buttons or the File menu, so you can switch between different filter presets for different projects.
- **Light / Dark / System themes**, togglable from Settings or `Ctrl+Shift+D`.
- **Persistent settings** — window size/position, theme, table layout (columns/widths/row height/font size), your working filter set, and recent devices/projects are all remembered between launches (default theme is Light and all levels are enabled on a fresh install).
- **Collapsible, resizable panels** — the sidebar and the Search Results dock can each be hidden and drag-resized to fit your workflow.

---

## Requirements

- **Windows 10/11** (the packaged installer targets `win-x64`; other platforms aren't built/tested).
- **ADB (Android Debug Bridge)** for live device capture — the app auto-detects it via `ANDROID_HOME` / `ANDROID_SDK_ROOT`, the default Android SDK install location, or your system `PATH`. ADB isn't required just to open existing `.log`/`.txt` files.
- **USB debugging** enabled on the Android device (or an already-running emulator).

---

## Getting Started

### Run in development mode

```bash
npm install
npm run dev
```

This starts `electron-vite` in dev mode with hot reload for the renderer and auto-restart for the main process.

### Build a release installer (.exe)

```bash
npm run package:win
```

This runs `electron-vite build` followed by `electron-builder --win nsis`, producing a Windows NSIS installer at `deploy/LogCat Viewer-Setup-<version>.exe` (plus the unpacked app under `deploy/win-unpacked/`). The installer lets the user choose an install directory and is **not one-click** (it asks for confirmation and creates Desktop/Start Menu shortcuts).

### Other useful scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Production build of main/preload/renderer only (no installer). |
| `npm run dev:renderer` | Renderer-only preview in a plain browser tab, with a mock API — useful for quick UI iteration without Electron or a real device. |
| `npm run typecheck` | TypeScript checks for both the main and renderer projects. |
| `npm run lint` | ESLint over `src/`. |
| `npm run test` / `npm run test:watch` | Runs the Vitest unit tests (log parsing, filter engine). |

---

## Usage Guide

### 1. Capture from a device

1. Click the device selector in the toolbar and pick a connected device (or refresh if it's not listed — check USB debugging is enabled).
2. Press **Start**. Lines stream in and auto-scroll to the bottom (toggle **Auto Scroll** off to read older lines without being pulled back down).
3. **Pause/Resume** freezes the view without stopping the device's own logcat stream; **Stop** ends capture. **Clear** empties the current view; right-click Clear to also wipe the device's logcat buffer.

### 2. Filter what you see

- Use the **Filters** tab in the sidebar: click **+ Add** to create a filter, set its match criteria and color, and save.
- Toggle a filter's checkbox to activate/deactivate it, or use the "Filters Enabled/Disabled" switch to bypass all of them at once.
- Right-click the **Filters** tab for **Select All Filters** / **Unselect All**.
- Use the quick V/D/I/W/E/F chips in the search bar for a fast severity cutoff that doesn't touch your saved filters.

### 3. Search

- Type in the search box and press Enter (or click the search icon) to search the full buffer — this expands the **Search Results** dock at the bottom, independent of whatever filters are currently applied.
- Toggle `.*` for regex search, `Aa` for case-sensitive search.
- Double-click a search result to jump to that exact line in the main table.
- Click the × in the search box to clear it instantly.

### 4. Inspect a line

- Double-click any row in the main table for the full detail dialog (Message / Raw Line / Stack Trace tabs, with Copy).
- Right-click a row for a quick Copy Line / Copy Message / View Full Detail menu.

### 5. Work with files

- **File > Open Log File…** (`Ctrl+O`) or the toolbar's **Open** button — select one file, or multiple at once (they're merged into a single chronological timeline).
- **File > Save Log…** (`Ctrl+S`) or the toolbar's **Save** button — saves everything currently captured to a `.log` file.
- The **Explore** tab in the sidebar lets you browse the filesystem and double-click a `.log`/`.txt` file to open it directly.

### 6. Save / load a filter set

- Sidebar **Save Filter** button, or **File > Save Project…** (`Ctrl+Shift+S`) — writes your current filter list to a `.lcv.json` project file.
- Sidebar **Load** button, or **File > Open Project…** — loads a different filter set from a `.lcv.json` file.

### 7. Customize the table & theme

- **Settings** (`Ctrl+,`) → **General** tab for Light/Dark/System theme; **Table** tab for row height, text size, and which columns are shown.
- `Ctrl+Shift+D` toggles the theme directly without opening Settings.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open Log File… |
| `Ctrl+S` | Save Log… |
| `Ctrl+Shift+S` | Save Project… |
| `Ctrl+,` | Open Settings |
| `Ctrl+F` | Find |
| `Ctrl+K` | Clear the current view |
| `Ctrl+Shift+D` | Toggle Light/Dark theme |
| `Alt` | Reveal the native menu bar (hidden by default) |

---

## Tech Stack

Electron + `electron-vite` (separate main/preload/renderer builds) + React 18 + TypeScript (strict) + Zustand (state) + `@tanstack/react-virtual` (virtualized log table, so a large buffer keeps scrolling smoothly) + `electron-store` (settings persistence) + `electron-builder` (NSIS Windows installer). See `IMPLEMENTATION_PLAN.md` for the original design/architecture plan.
