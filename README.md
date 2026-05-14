# Nust

A minimal, keyboard-driven text editor for Windows. Up to four resizable panes, a command palette, and no chrome in the way.

Built with Rust and [egui](https://github.com/emilk/egui).

## Quick Start

Install [Rust](https://rustup.rs) (the `.exe` installer), then in a terminal:

```powershell
cargo run
```

No environment variables, no workarounds. Native file dialogs work out of the box.

## Layout

Panes fill in order: top-left → top-right → bottom-left → bottom-right.

| Shortcut | Layout |
|----------|--------|
| `Ctrl+1` | Single pane |
| `Ctrl+2` | Side by side |
| `Ctrl+3` | Left column split, right single |
| `Ctrl+4` | 2×2 grid |

All dividers are mouse-draggable to resize. The thin strip at the very top of the window is the drag handle for moving it.

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Open / close command palette |
| `Ctrl+O` | Open file into focused pane |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+Alt+S` | Quick save (timestamped, no dialog) |
| `Ctrl+W` | Close focused pane |
| `Ctrl+Tab` | Focus next pane |
| `Ctrl+Shift+Tab` | Focus previous pane |
| `Ctrl+Alt+W` | Toggle word wrap |
| `PageUp / PageDown` | Scroll focused pane |

The command palette (`Ctrl+Shift+P`) lists every action with its shortcut. Type to filter, `↑/↓` to navigate, `Enter` to run.

## Quick Save

`Ctrl+Alt+S` writes a timestamped file to `target/quick_saves/` (falls back to the system temp dir). No dialog, no interruption. Files are named `nust_<pane>_<timestamp>.txt`.

## Build

```powershell
cargo build --release   # optimised binary → target/release/nust.exe
cargo check             # type-check only
cargo fmt               # format before committing
```

Requires stable Rust 1.90.0 or later.
