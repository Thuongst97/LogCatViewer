# Android Logcat Viewer — Implementation Plan

Status: Draft v1
Design reference: [`UI_Design/`](./UI_Design) (source `.dc.html` mockups — authoritative for colors, spacing, typography) and the published canvas at https://claude.ai/code/artifact/3453243c-dbd6-4d1c-ae75-be03086690f4

---

## 1. Overview

A desktop application for capturing, filtering, searching and inspecting Android `logcat` output from one or more devices/emulators over ADB — modeled on DLT Viewer's proven interaction patterns (dockable filter panel, message inspector, persistent search-results dock, dedicated Filter/Export dialogs) but built for Android's logcat data model instead of the DLT/AUTOSAR protocol.

**Primary goals**

1. Live-capture logcat from a selected ADB device with Start/Pause/Stop control.
2. Filter by tag, PID, log level, free-text/regex, with saved, reusable filter rules (positive / negative / marker).
3. Fast full-text search across the buffer with a persistent results dock.
4. Inspect a selected message's parsed fields, raw line, and reconstructed stack trace.
5. Export the current buffer (all / filtered / marked) to Text, JSON, CSV, raw, or HTML.
6. Ship as a signed-ready Windows `.exe` installer.
7. Light and dark themes, switchable at runtime and persisted.

---

## 2. Tech Stack Decision

The brief asks for Electron, with room to recommend an alternative if it gives a smoother result. Here's the comparison and the call:

| | **Electron** | Tauri | Native Qt/C++ (fork DLT Viewer) |
|---|---|---|---|
| UI reuse from mockups | **Direct** — mockups are literal HTML/CSS/SVG, map ~1:1 to React components | Same (also a webview), but Rust backend adds a second language | None — full rewrite in QWidget/QML |
| ADB integration (spawn process, parse stdout stream) | **Trivial** — Node `child_process`, huge ecosystem | Needs Rust `std::process` + IPC bridge to frontend | Native, but requires wiring a new `QDltConnection` subclass |
| Packaging to Windows `.exe` | **Mature** — `electron-builder` NSIS target is a solved problem | Good, but smaller community / less battle-tested on Windows edge cases | Requires CMake + NSIS/WiX setup from scratch |
| Memory / bundle size | Heavier (~120–200MB RAM baseline, ~150MB installer) | Much lighter (~20–40MB RAM, ~10MB installer) | Lightest at runtime, heaviest to build |
| Team velocity for this exact scope | **Highest** — one language (TS), matches delivered mockups | Medium — need Rust for anything beyond basic process spawning | Lowest — large unfamiliar C++ codebase, per earlier fork analysis |
| Risk for a dense, high-throughput log table | Manageable with virtualization + batched IPC (below) | Slightly better headroom, same virtualization need either way | Best raw performance, irrelevant if dev velocity tanks |

**Decision: Electron.** The deciding factor isn't raw performance — it's that the deliverable UI already exists as HTML/CSS/inline-SVG mockups; Electron (React + TypeScript) lets us carry that work over almost verbatim, while Tauri would still require the same frontend work plus a Rust backend, and Qt/C++ would discard the mockups entirely and re-derive the same layout in a different toolkit. Electron's known weaknesses (memory, bundle size) are specifically the ones this app's architecture (batched IPC, virtualized table, capped ring buffer — §8) is designed to neutralize. If a future v2 needs a materially smaller footprint, the renderer code (React components, state, filter/parsing logic) ports to Tauri with minimal change — only the main-process/IPC layer would be rewritten in Rust.

---

## 3. Architecture

```
┌─────────────────────────────── Electron App ───────────────────────────────┐
│                                                                              │
│  Main Process (Node.js)                    Renderer Process (Chromium)     │
│  ─────────────────────                     ─────────────────────────      │
│  • AdbService                               • React UI (components §11)    │
│    - device discovery (adb track-devices)   • Zustand stores:              │
│    - spawn `adb logcat -v threadtime`         - logStore (ring buffer)     │
│    - line parser → LogEntry                   - filterStore                │
│    - batches lines every ~40ms                - deviceStore                │
│  • FileService (open/save native dialogs)     - uiStore (theme, layout)    │
│  • SettingsService (electron-store)         • TanStack Virtual table       │
│  • ExportService (write files)              • Filter/Export dialogs        │
│  • Window/menu/tray management              • Web Worker: regex search    │
│                                                over large buffers           │
│         │              ▲                              │           ▲       │
│         │  IPC (batched log arrays, device list,       │           │       │
│         │  command results)                            │           │       │
│         ▼              │                                ▼           │       │
│  ───────────────────────────── contextBridge (preload.ts) ─────────────── │
└──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
   `adb.exe` subprocess → USB/TCP → Android device / emulator
```

**Why this split:** ADB process management, file I/O, and OS integration belong in the main process (Node APIs, no sandbox restrictions). The renderer stays purely presentational + client-side state, communicating only through a narrow, typed `contextBridge` API (`window.api.*`) — no `nodeIntegration`, `contextIsolation: true`, matching Electron's current security baseline.

---

## 4. Technology Stack

| Concern | Choice | Why |
|---|---|---|
| Shell | Electron (latest stable) | Per §2 |
| Build tooling | `electron-vite` | Fast HMR for renderer, sane main/preload/renderer split, far less config than Forge+Webpack |
| UI framework | React 18 + TypeScript (strict) | Matches mockup structure, huge ecosystem |
| State management | Zustand | Minimal boilerplate, no re-render storms under high-frequency log updates (unlike naive Context/Redux) |
| List virtualization | `@tanstack/react-virtual` | Renders only visible rows regardless of buffer size — required for 100k+ line tables |
| Styling | CSS Modules + a shared `tokens.css` of CSS custom properties | Directly ports the mockups' `--bg-app`, `--level-*`, etc. variables — highest fidelity to the approved design, no utility-class translation step |
| Icons | Inline SVG components (extracted from the mockups) | Already hand-drawn and approved; no icon-font dependency |
| Packaging | `electron-builder` (NSIS target) | Mature Windows `.exe` installer support |
| Auto-update (future) | `electron-updater` | Pairs with electron-builder; deferred to post-v1 (§19) |
| Settings/persistence | `electron-store` | Simple JSON persistence for window state, theme, recent devices, saved filters |
| Testing | Vitest + React Testing Library, Playwright (Electron mode) for E2E | Fast unit loop + real end-to-end smoke coverage |
| Lint/format | ESLint + Prettier, TS strict mode | Baseline hygiene |

---

## 5. Project Structure

```
LogCatViewer/
├── UI_Design/                    # approved mockups (source of truth for visuals)
├── electron-builder.yml
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
├── src/
│   ├── main/                     # Main process
│   │   ├── index.ts
│   │   ├── services/
│   │   │   ├── AdbService.ts     # device discovery + logcat streaming
│   │   │   ├── LogParser.ts      # threadtime line → LogEntry
│   │   │   ├── FileService.ts    # open/save dialogs, project files
│   │   │   ├── ExportService.ts  # Text/JSON/CSV/Raw/HTML writers
│   │   │   └── SettingsService.ts
│   │   ├── ipc/                  # ipcMain handlers, one file per channel group
│   │   ├── menu.ts
│   │   └── windowState.ts
│   ├── preload/
│   │   └── index.ts              # contextBridge surface (typed)
│   ├── renderer/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── styles/
│   │   │   ├── tokens.css        # light + dark CSS variables (from mockups)
│   │   │   └── global.css
│   │   ├── components/
│   │   │   ├── Toolbar/
│   │   │   ├── DeviceSelector/
│   │   │   ├── FilterSidebar/
│   │   │   ├── DetailInspector/  # Message / Raw / Stack Trace tabs
│   │   │   ├── SearchBar/
│   │   │   ├── LogTable/         # virtualized table + row renderer
│   │   │   ├── SearchResultsDock/
│   │   │   ├── StatusBar/
│   │   │   ├── FilterEditorDialog/
│   │   │   └── ExportDialog/
│   │   ├── state/
│   │   │   ├── logStore.ts
│   │   │   ├── filterStore.ts
│   │   │   ├── deviceStore.ts
│   │   │   └── uiStore.ts
│   │   ├── workers/
│   │   │   └── searchWorker.ts
│   │   └── lib/
│   │       ├── types.ts          # LogEntry, Filter, ExportOptions, Device
│   │       └── filterEngine.ts
│   └── shared/
│       └── ipcChannels.ts        # channel name + payload type contracts
├── build/                        # icons, installer assets
└── tests/
    ├── unit/
    └── e2e/
```

---

## 6. Data Model

```ts
interface LogEntry {
  id: number;              // monotonically increasing, assigned on capture
  date: string;             // "09-12"
  time: string;             // "14:32:09.290"
  pid: number;
  tid: number;
  level: 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S';
  tag: string;
  message: string;          // first physical line
  continuation?: string[];  // subsequent unheadered lines (stack traces etc.)
  raw: string;               // original line(s), for the "Raw" inspector tab and raw export
  deviceId: string;
}

interface Filter {
  id: string;
  name: string;
  active: boolean;
  type: 'positive' | 'negative' | 'marker';
  color?: string;            // required when type === 'marker'
  tag?: { value: string; enabled: boolean };
  pid?: { value: number; enabled: boolean };
  message?: { value: string; regex: boolean; ignoreCase: boolean; enabled: boolean };
  minLevel?: { value: LogEntry['level']; enabled: boolean };
  process?: { value: string; enabled: boolean };
}

interface Device {
  serial: string;
  model: string;
  androidVersion?: string;
  state: 'device' | 'offline' | 'unauthorized';
}
```

This mirrors the fields already visible in the mockups' table columns and the Filter Editor's field list — the UI and the data model were designed together, so no translation layer is needed between them.

---

## 7. ADB Integration Layer (Main Process)

- **ADB discovery:** on first run, probe `ANDROID_HOME` / `ANDROID_SDK_ROOT` env vars, then common Windows install paths (`%LOCALAPPDATA%\Android\Sdk\platform-tools`), then `PATH`. If not found, show a first-run **"Locate adb.exe"** picker (native `dialog.showOpenDialog`) and persist the chosen path via `SettingsService`.
- **Device list:** run `adb track-devices` (a long-lived ADB command that streams connect/disconnect/state-change events) rather than polling `adb devices` — feeds the Device Selector popover in real time, including the "offline" state shown in the mockup.
- **Capture:** `child_process.spawn('adb', ['-s', serial, 'logcat', '-v', 'threadtime'])`. `threadtime` format (`MM-DD HH:MM:SS.mmm PID TID LEVEL TAG: message`) already contains every column the table needs, one regex away:
  ```
  ^(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+([^:]*?):\s?(.*)$
  ```
  A line that doesn't match this pattern (e.g. a Java/native stack trace frame) is appended to the previous `LogEntry.continuation[]` rather than starting a new row — this is what feeds the mockup's **Stack Trace** inspector tab.
- **Multi-device:** each connected/enabled device gets its own `AdbService` capture instance; log entries are tagged with `deviceId` so a future multi-device merged view is possible without a data-model change (out of scope for v1's UI, which shows one active device at a time per the toolbar's single device selector).
- **Lifecycle:** Start/Pause/Stop map to spawn / SIGSTOP-equivalent (Windows has no SIGSTOP — "Pause" instead stops forwarding batches to the renderer while the subprocess keeps running, so no lines are lost) / kill. Auto-reconnect with exponential backoff if the device drops mid-capture, surfaced in the status bar (`emulator-5554 connected` → `reconnecting…` → `disconnected`).
- **Clear:** clears the renderer's buffer only (matches DLT/Android Studio convention) — does not run `adb logcat -c`, which would also wipe the buffer for any other tool reading it. Offer `adb logcat -c` as an explicit secondary action in the Clear button's dropdown, not the default.

---

## 8. Log Storage & Performance Strategy

This is the part that determines whether Electron feels smooth or sluggish under real logcat throughput (which can spike to thousands of lines/second on a noisy device):

1. **Batch, don't stream line-by-line.** The main process buffers parsed `LogEntry` objects and flushes to the renderer over IPC every ~40ms or every 500 entries (whichever comes first). One IPC message with 500 entries is dramatically cheaper than 500 IPC messages.
2. **Capped ring buffer in the renderer.** `logStore` holds a fixed-capacity array (default 100,000 lines, configurable in Settings, matching the kind of cap DLT Viewer and Android Studio's Logcat both impose). Oldest entries drop once the cap is hit; a status-bar indicator (already present in the mockup's status bar) shows total vs. capacity.
3. **Virtualized rendering.** `LogTable` renders via `@tanstack/react-virtual` — only the ~30–40 visible rows exist in the DOM at any time, so table size is decoupled from render cost. This directly targets the "dense monospace table" requirement in the original brief without the perf cliff a naive `<table>` with 100k `<tr>`s would hit.
4. **Filtering is computed, not stored twice.** Filters produce an index array (which buffer positions are visible) rather than a filtered copy of the data, avoiding duplicate memory for large buffers.
5. **Search runs off the main thread.** The Search Results dock's full-buffer text/regex search runs in a Web Worker (`searchWorker.ts`) so a large regex scan never blocks scrolling or incoming log rendering.
6. **Autoscroll is opt-out, not forced.** When enabled (default, per the mockup's toolbar toggle), the table pins to bottom only if the user hasn't manually scrolled up — scrolling up auto-disables it until the user scrolls back down or re-enables it, which is the standard logcat-viewer UX contract.

---

## 9. Filtering Engine

- Filters are pure predicate functions compiled from the `Filter` model (§6), evaluated per-entry.
- **Positive** filters: entry must match at least one active positive filter to be visible (if any positive filters exist; if none, all entries pass this stage).
- **Negative** filters: entry is hidden if it matches any active negative filter, regardless of positive matches.
- **Marker** filters: never hide anything — they only apply a highlight color to matching rows (this is why the Filter Editor's "Highlight Color" section is independent of the Positive/Negative/Marker type selector in the mockup).
- Combining rule mirrors DLT Viewer's model exactly (validated against `Filter_Configuration.png` in the earlier design pass) since it's a well-understood mental model for this exact tool category.
- Filters are saved/loaded as part of a **Project file** (`.lcv.json`) — see §14 — so a saved filter set can be shared between machines/teammates, matching DLT Viewer's `.dlf`/`.dlp` convention.

---

## 10. Search

- The Search Bar's text input (with regex + case-sensitive toggles, per the mockup) searches the *currently filtered* view live, debounced ~150ms, highlighting matches inline in the table.
- Pressing Enter (or a dedicated "Search Results" action) additionally runs the query against the **full unfiltered buffer** in the Web Worker and populates the bottom Search Results dock — this dual behavior (live-highlight-in-view vs. a separate full-buffer results list) is exactly what the DLT Viewer reference screenshot shows (search box at top, independent "Search Results" panel at bottom with its own count).

---

## 11. UI Implementation (mapped to approved mockups)

Each mockup artboard in `UI_Design/` becomes one top-level component tree. Build order follows the milestone plan in §19, but the mapping is fixed up front:

| Mockup | Component(s) | Notes |
|---|---|---|
| `Main.dc.html` toolbar | `<Toolbar>` | Device selector trigger, Start/Pause/Stop (state-driven enable/disable), Clear (with dropdown for "also clear device buffer"), Open/Save/Export, Settings |
| `Main.dc.html` sidebar — Filters tab | `<FilterSidebar>` | List rows drive from `filterStore`; "+Add" and each row's edit icon open `<FilterEditorDialog>` |
| `Main.dc.html` sidebar — Details panel | `<DetailInspector>` | Message / Raw / Stack Trace tabs bound to `logStore.selectedEntry` |
| `Main.dc.html` search bar + level chips | `<SearchBar>` | Regex/case toggles, V/D/I/W/E/F quick filters (these are a *view-level* filter layered on top of saved Filters, not a saved Filter themselves) |
| `Main.dc.html` table | `<LogTable>` | Virtualized; row background/level-color logic centralized in one `getRowStyle(entry)` function so theme + level tinting stay consistent |
| `Main.dc.html` search results dock | `<SearchResultsDock>` | Collapsible (chevron in the mockup already implies this); backed by the Web Worker search result set |
| `Main.dc.html` status bar | `<StatusBar>` | Total/filtered counts, connection + capture state (live from `deviceStore`/`AdbService` state) |
| `FilterEditor.dc.html` | `<FilterEditorDialog>` | Controlled form over the `Filter` model; opens for both "new" and "edit" |
| `ExportDialog.dc.html` | `<ExportDialog>` | Format/scope pill selectors, options, native save-path picker via `FileService` |
| `DeviceSelector.dc.html` | `<DeviceSelector>` (popover) | Anchored to the toolbar trigger; live list from `deviceStore`, backed by `adb track-devices` |

Icons, spacing, and the exact color tokens are lifted directly from the mockup files rather than re-derived, so implementation review is a diff against `UI_Design/*.dc.html`, not a subjective judgment call.

---

## 12. Theming (Light / Dark)

- All colors in the mockups are already CSS custom properties on a single `.app` scope (`--bg-app`, `--bg-panel`, `--text-primary`, `--level-*`, `--accent`, etc.) — this was a deliberate choice in the design pass specifically to make theming mechanical rather than a rewrite.
- `tokens.css` defines two blocks:
  ```css
  :root[data-theme="dark"] { --bg-app:#1a1d23; --bg-panel:#1e2127; --text-primary:#e6e8eb; /* … */ }
  :root[data-theme="light"] { --bg-app:#f5f6f8; --bg-panel:#ffffff; --text-primary:#1a1d23; /* … */ }
  ```
  Light-theme values are new (not in the current dark-only mockups) and should get a **short design pass before implementation** — flagged as an open item in §19 Phase 1, not something to invent silently mid-build. Level colors (`--level-e`, `--level-w`, etc.) need contrast-checked light-mode variants, not a direct reuse of the dark ones, since e.g. the current amber/red read poorly on a light background at the same lightness.
- `data-theme` is set on `<html>` by `uiStore`, toggled from a Settings menu item and a quick-toggle in the toolbar; persisted via `electron-store`; defaults to **follow OS theme** (`nativeTheme.shouldUseDarkColors`, with a live listener for OS theme changes) unless the user overrides it.
- No component may hardcode a color outside `tokens.css` — enforced with an ESLint rule (`no-restricted-syntax` on hex literals in `.tsx` style props) so light/dark stays complete as new UI is added.

---

## 13. Native Integration

- **Application menu:** File (Open, Save Project, Export, Exit), Edit (Find, Preferences), Capture (Start/Pause/Stop/Clear), View (Theme, Toggle Sidebar, Toggle Search Results), Help (About, Docs).
- **Keyboard shortcuts:** `Ctrl+F` focus search, `Ctrl+K` clear, `Ctrl+E` export, `Ctrl+,` preferences, `Ctrl+Shift+D` toggle theme, standard `Ctrl+O`/`Ctrl+S`.
- **Native dialogs:** Open log file, Save project, Export destination, and the first-run "Locate adb.exe" all use Electron's `dialog` module — never a custom in-page file picker.
- **Window state:** remember size/position/maximized state across launches (`electron-store` + `main/windowState.ts`).
- **Tray icon:** out of scope for v1; logged as a possible v2 addition (background capture with tray status).

---

## 14. Persistence

| What | Where | Format |
|---|---|---|
| App settings (theme, adb path, buffer cap, recent devices/files) | `electron-store` (`%APPDATA%/LogCatViewer/config.json`) | JSON |
| Saved filter sets | Project file, user-chosen location | `.lcv.json` (name, filters[], created/modified) |
| Captured session save/reload | Project file or raw export | `.lcv.json` (entries + metadata) for full fidelity reload; plain exports (§15) are one-way |

---

## 15. Export

Implements the `ExportDialog` mockup exactly:

- **Formats:** Plain Text, JSON, CSV, Raw (original logcat lines, unmodified), HTML (styled, theme-aware standalone page).
- **Scope:** All lines / Filtered view / Marked only (marked = rows tagged by a `marker`-type filter).
- **Options:** include column headers, only currently-visible columns.
- Export runs in the main process (`ExportService`) via streamed writes (not building one giant string in memory) so exporting a full 100k-line buffer doesn't spike memory.

---

## 16. Packaging & Distribution

- **Tool:** `electron-builder`, `nsis` target for Windows.
- **Installer behavior:** `oneClick: false`, `allowToChangeInstallationDirectory: true`, desktop + start-menu shortcuts, per-user install by default (no admin prompt required), clean uninstall via Windows "Apps & Features".
- **Versioning:** semantic version in `package.json`, surfaced in the About dialog and installer metadata.
- **Icons:** `.ico` multi-resolution app icon (`build/icon.ico`), generated from a single high-res source.
- **Code signing:** not included in v1 (requires a purchased cert) — unsigned builds will trigger a Windows SmartScreen warning on first run. Documented as a known limitation; revisit if/when the app is distributed beyond the immediate team.
- **Build command:** `electron-builder --win nsis` producing `LogCatViewer-Setup-<version>.exe` in `dist/`.
- **Auto-update:** deferred (§19) — when added, `electron-updater` + a static file host or GitHub Releases feed is the natural next step; the installer config above is already compatible with it.

---

## 17. UX Principles (beyond visual design)

- **Never block on a slow operation.** Search, export, and filter recompilation over large buffers all run off the render thread (worker or main process); the UI shows a lightweight in-progress state rather than freezing.
- **Every destructive action is reversible or confirmed.** Clear prompts confirmation only when it would also touch the device buffer (`adb logcat -c`); clearing the local view alone does not need confirmation (it's non-destructive to the source).
- **Empty and error states are designed, not default:** "No device connected" (with a direct call-to-action to open the Device Selector), "adb not found" (with a CTA to the locate-adb picker), "Device disconnected mid-capture" (status bar reflects reconnecting/disconnected, capture auto-resumes if the device comes back), "No results" for search/filtering.
- **Autoscroll behaves like every other logcat viewer users already know** (§8.6) — this is a place where matching convention beats novelty.
- **Keyboard-first for power users:** every dialog is fully operable via keyboard (Tab order, Enter to submit, Esc to cancel), consistent with the target audience (developers debugging with a keyboard, not a mouse).
- **Theme changes apply instantly, no restart**, and never reset scroll position, filters, or selection.

---

## 18. Testing Strategy

- **Unit (Vitest):** `LogParser` (threadtime regex + multi-line continuation), `filterEngine` (positive/negative/marker combination logic), `ExportService` writers.
- **Component (React Testing Library):** `FilterEditorDialog` field-to-model binding, `LogTable` row-level color/selection logic, theme token application.
- **E2E (Playwright, Electron mode):** launch app → mock/fixture ADB device → start capture → apply a filter → verify visible rows → export → verify file contents. A recorded `.txt` fixture of real `adb logcat` output stands in for a live device in CI.
- **Manual perf check before each release:** sustained synthetic feed at ~2,000 lines/sec for 5 minutes, verify scroll stays smooth and memory stays bounded (ring buffer cap holding).

---

## 19. Milestones

| Phase | Scope | Key exit criteria |
|---|---|---|
| **0 — Project setup** | electron-vite scaffold, TS/ESLint/Prettier config, `tokens.css` ported from mockups (dark only), window chrome, empty-state shell | App launches to an empty themed window |
| **1 — Theming foundation** | Design + implement light-mode token set (new work, not just inversion — see §12); theme toggle + OS-follow; dark mode = pixel match to `Main.dc.html` | Toggling theme live-updates every surface, no hardcoded colors remain |
| **2 — Device & capture core** | `AdbService`, Device Selector popover, Start/Pause/Stop/Clear, raw line streaming into an unfiltered virtualized `LogTable` | Can capture and scroll a live device's logcat smoothly |
| **3 — Filtering** | `filterStore`, `FilterSidebar`, `FilterEditorDialog`, quick level chips in the search bar | Saved filters persist across restart and correctly show/hide/mark rows |
| **4 — Search & inspector** | Live in-view search highlighting, `SearchResultsDock` + worker search, `DetailInspector` (Message/Raw/Stack Trace) | Selecting a crash row shows a reconstructed stack trace; search dock matches DLT reference behavior |
| **5 — Export & projects** | `ExportDialog` + `ExportService` (all 5 formats), Project save/load (`.lcv.json`) | Round-trip: save project → close app → reopen → filters and (optionally) buffer restored |
| **6 — Packaging** | `electron-builder` NSIS config, icons, installer smoke test on a clean Windows VM | `LogCatViewer-Setup-x.y.z.exe` installs, launches, uninstalls cleanly |
| **7 — Hardening & polish** | Empty/error states, keyboard shortcuts, perf pass at 2k lines/sec, accessibility pass (focus states, contrast in both themes) | Meets §17 UX principles end-to-end |

Phases are sequential dependencies for the core loop (0→2→3→4) but 5/6 can start once 2–4 are stable; 1 (theming) should land early since retrofitting theme tokens after components hardcode styles is much more expensive than building on tokens from the start.

---

## 20. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| ADB not installed / not on PATH on a fresh machine | First-run detection + manual locate-adb picker (§7); document requirement in a README/first-run screen |
| High-throughput devices overwhelm the UI | Batched IPC, ring buffer cap, virtualization (§8) — validated by the Phase 7 perf pass |
| Windows SmartScreen warning on unsigned installer | Documented limitation now; revisit code signing if distribution scope grows |
| Light-theme contrast/legibility for log-level colors | Explicit design pass in Phase 1, not a mechanical color inversion |
| Multi-line stack traces mis-parsed as separate log rows | `LogParser` continuation-line handling tested against real crash-log fixtures in unit tests |
| Device disconnect mid-capture loses in-flight data | Reconnect-with-backoff (§7); entries already delivered to the renderer are unaffected |

---

## 21. Open Questions for the user before/at Phase 1

1. Any existing brand guidelines or a required Windows app icon, or should one be designed fresh?
2. Target minimum Android version for `logcat` format compatibility (affects whether `threadtime` is universally safe or whether older/vendor ROMs need a fallback parser)?
3. Should captured sessions (not just filters) be saveable/reloadable in v1 (§14), or is that acceptable to defer to a later phase?
