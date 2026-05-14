# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Tauri 2 (Rust backend, WebView2 frontend) + Vite + TypeScript + CodeMirror 6.
Target platform is Windows-native; previous egui implementation lives under `legacy/`.

## Build & Run

```powershell
npm install                 # first time only
npm run tauri dev           # dev with hot reload (frontend + backend)
npm run tauri build         # produce installer in src-tauri/target/release/bundle/
npm run build               # frontend type-check + bundle only
cd src-tauri && cargo check # backend type-check only
```

No automated tests. Verify changes by running `npm run tauri dev` and exercising the open/save/edit flows.

## Architecture

### Backend (`src-tauri/`)

- `src/main.rs` exposes `read_file` and `write_file` as `#[tauri::command]` handlers; everything else (dialogs, window chrome) is handled by the Tauri/WebView2 layer.
- `tauri.conf.json` defines the window (`label: "main"`, 1100×750, decorations on).
- `capabilities/default.json` grants `core:default` + `dialog:default` to the main window. Add more granular grants here if new plugins are introduced.
- File I/O is intentionally kept on the Rust side rather than going through `tauri-plugin-fs`, which would require broader filesystem permissions.

### Frontend (`src/`)

- `main.ts` constructs the CodeMirror `EditorView`, wires the toolbar buttons + Ctrl+O/S/Shift+S, and calls the Tauri `dialog` plugin + invoke handlers for file I/O.
- State is currently global module-scope (`currentPath`, `dirty`). When tabs land, this becomes a per-tab record.
- Theme is a single `EditorView.theme(...)` block in `main.ts` — keep dark-theme tweaks there until it grows.

### Frontend ↔ Backend contract

| Frontend call | Backend handler | Notes |
|---|---|---|
| `invoke("read_file", { path })` | `read_file(path) -> Result<String, String>` | Errors stringified |
| `invoke("write_file", { path, content })` | `write_file(path, content) -> Result<(), String>` | Overwrites |
| `openDialog({ filters })` | plugin-dialog | Returns absolute path or null |
| `saveDialog({ filters, defaultPath })` | plugin-dialog | Returns absolute path or null |

## Conventions

- Status messages: short, present-tense ("save error: …", "untitled •"). Render via `renderStatus()` so the dirty indicator stays consistent.
- Add a new Tauri command only when the frontend genuinely needs OS access; prefer doing logic in TypeScript.
- When adding plugins (e.g. `tauri-plugin-fs`, `tauri-plugin-clipboard`), also add the matching permission to `src-tauri/capabilities/default.json`.
- Commit messages: sentence-style ("Add tab bar with dirty indicators"). Note if `cargo check` and/or `npm run build` pass.

## Legacy

`legacy/main.rs` and `legacy/Cargo.toml` are the egui dual-pane editor this project started as. Keep around as reference for UX decisions (command palette layout, shortcut choices, quick-save semantics) — do not import code from it.
