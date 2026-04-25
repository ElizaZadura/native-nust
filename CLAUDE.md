# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
cargo run                   # Build and launch
cargo build --release
cargo check                 # Type-check without launching
cargo fmt                   # Format before committing
```

Stable Rust 1.90.0 builds this project; no nightly override is required for edition 2024.

There is no automated test suite. Verify changes manually with `cargo run`, focusing on pane interactions, command palette (Ctrl+Shift+P), and file save/load flows.

## Architecture

The entire application lives in `src/main.rs` (~960 lines). It uses `eframe` for the window and `egui` for immediate-mode UI rendering.

**Core structs:**

- `Pane` — one editing surface (left or right). Holds `title`, `path`, `text`, `dirty` flag, and scroll state. Provides `load_from()`, `save()`, `save_as()`.
- `App` — top-level application state: two `Pane` instances, focused pane, dialog/command palette state, and a list of registered `AppAction`s with their shortcuts.

**Key enum: `AppAction`** — covers Open, Save, SaveAs, QuickSave, Close, Focus, Layout (single/split), ToggleWordWrap. All user intent routes through `perform_action()`.

**UI flow per frame:**
1. `update()` draws top menu, status bar, and one or two pane panels.
2. `process_shortcuts()` translates keyboard input to `AppAction`.
3. `command_palette_ui()` renders the searchable overlay (Ctrl+Shift+P) and emits actions on Enter.
4. `perform_action()` mutates `App`/`Pane` state or triggers file I/O.

**Quick save** writes timestamped files (`nust_<pane>_<timestamp>.txt`) to `target/quick_saves/` (or system temp as fallback). This directory is `.gitignore`d.

**Native file dialogs:** open/save flows use `rfd` directly.

## Coding Conventions

- Status messages should be short and actionable ("Split view enabled").
- Keep UI logic in `App`; extract helper structs/enums when a concept grows.
- Use the existing `nust_<pane>_<timestamp>.txt` naming for any quick-save variant.
- Commit messages: sentence-style (`Add command palette with action shortcuts`). Note if `cargo check` passes.
