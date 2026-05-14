# Repository Guidelines

## Stack
Tauri 2 + Vite + TypeScript + CodeMirror 6, targeting Windows-native. The previous egui prototype lives under `legacy/` for reference only.

## Project Structure
- `index.html`, `src/main.ts`, `src/style.css` — frontend (CodeMirror editor, toolbar, dialogs).
- `src-tauri/src/main.rs` — Rust commands (`read_file`, `write_file`) and Tauri runtime setup.
- `src-tauri/tauri.conf.json` — window/build config.
- `src-tauri/capabilities/default.json` — Tauri 2 permission grants for the main window.
- `docs/` — design notes and historical migration docs.
- `legacy/` — archived egui implementation; do not import from it.

## Build, Test, Development
- `npm install` — first-time setup.
- `npm run tauri dev` — run the app with hot reload (frontend + backend).
- `npm run tauri build` — produce installers (`src-tauri/target/release/bundle/`).
- `npm run build` — type-check + bundle frontend only.
- `cd src-tauri && cargo check` — type-check backend only.
- `cd src-tauri && cargo fmt` — format Rust sources.

## Style & Naming
- Rust 2021, rustfmt defaults.
- TypeScript: 2-space indent, `strict` enabled in `tsconfig.json`. Keep state at module scope until it warrants a class.
- Status strings: short, present tense ("untitled •", "save error: …").
- New Tauri commands: snake_case, return `Result<T, String>` (stringify errors).

## Adding Tauri Plugins
When introducing a plugin (e.g. `tauri-plugin-fs`, `tauri-plugin-clipboard`):
1. Add the Rust crate to `src-tauri/Cargo.toml`.
2. Add the matching `@tauri-apps/plugin-…` npm package.
3. Register in `src-tauri/src/main.rs` via `.plugin(plugin_x::init())`.
4. Grant the required permission in `src-tauri/capabilities/default.json`.

## Testing
- No formal test suite. Verify via `npm run tauri dev` — exercise open/save flows, edit + dirty indicator, keybinds, error paths.
- When adding tests, colocate Rust unit tests in `src-tauri/src/`; frontend tests can go in `src/__tests__/` once a runner is chosen.

## Commits & PRs
- Sentence-style commit messages ("Add tab bar with dirty indicators").
- Mention which checks passed (`cargo check`, `npm run build`).
- PRs: summarise user-facing changes; include screenshots when UI layout changes meaningfully.
