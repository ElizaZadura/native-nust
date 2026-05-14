# Nust

A keyboard-driven markdown editor for Windows. Tauri shell, Rust backend, CodeMirror 6 frontend.

> **Status:** under active rework. The previous egui prototype lives under `legacy/`.

## Prerequisites

- **Rust** (stable) — install from [rustup.rs](https://rustup.rs)
- **Visual Studio Build Tools** with "Desktop development with C++" workload
- **Node.js 20+** — install from [nodejs.org](https://nodejs.org) or via winget
- **WebView2** — bundled with Windows 11; Windows 10 may need the [Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)

## Quick Start

```powershell
npm install
npm run tauri dev
```

Vite serves the frontend at `http://localhost:1420`; Tauri opens a native window pointing at it. Hot-reload works for both frontend and backend.

## Build

```powershell
npm run tauri build
```

Produces an installer under `src-tauri/target/release/bundle/`.

## Project Layout

```
nust/
├── index.html              # frontend entry
├── src/                    # TypeScript + CSS (CodeMirror)
│   ├── main.ts
│   └── style.css
├── src-tauri/              # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/       # Tauri 2 permission grants
│   └── src/main.rs         # invoke handlers (read_file, write_file)
├── legacy/                 # previous egui implementation, for reference
└── package.json
```

## Current Feature Set (step 1 of the rewrite)

- Open / Save / Save As via native dialogs (`Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S`)
- CodeMirror 6 editor with markdown syntax, line numbers, undo/redo
- Dark theme, single pane

## Planned

- **Step 2** — tab bar, multi-file support, dirty indicators, close confirmation
- **Step 3** — split markdown preview (toggle or side-by-side), keybinds for tables / bold / italic / heading / list reflow

## Legacy

The original egui-based dual-pane editor is preserved under `legacy/` (main.rs + its Cargo.toml). Build it with `cargo run` inside `legacy/` if you need to refer back to behaviour.
