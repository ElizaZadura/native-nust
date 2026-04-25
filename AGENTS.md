# Repository Guidelines

## Project Structure & Module Organization
- `src/main.rs` contains the entire eframe/egui application, including pane state, command palette, and file operations.
- `docs/` stores design notes such as `todo.md`; keep planning or research artifacts here.
- Quick-save artifacts land in `target/quick_saves/`; they stay out of Git via `.gitignore`.

## Build, Test, and Development Commands
- `cargo run` — Build and launch the GUI.
- `cargo fmt` — Format Rust sources with rustfmt; run before committing.
- `cargo check` — Type-check without running the GUI (first run may take longer while caching deps).

## Coding Style & Naming Conventions
- Follow Rust 2024 idioms; rely on `rustfmt` for layout (4-space indentation).
- Keep UI actions and state localized in `App`; add helper structs/enums when functionality grows.
- Status strings should be short and actionable ("Split view enabled").
- Name quick-save files with the existing `nust_<pane>_<timestamp>.txt` scheme for consistency.

## Testing Guidelines
- No formal test suite yet. Manually verify additions via `cargo run`, focusing on pane interactions, command palette navigation (Ctrl+Shift+P, Arrow keys, Enter/Esc), and file save/load flows.
- When adding future tests, colocate Rust integration tests under `tests/` and follow `snake_case` filenames.

## Commit & Pull Request Guidelines
- Use descriptive, sentence-style commit messages (e.g., `Add command palette with action shortcuts`).
- Each commit should format code and keep unrelated changes out; mention if `cargo check` succeeds.
- PRs should summarize user-facing tweaks, list key shortcuts affected, and include screenshots only when UI layout changes substantially.

## Windows Native Notes
- The project builds with stable Rust 1.90.0; no nightly override is required for edition 2024.
- Native Windows development uses standard `cargo` commands and native `rfd` file dialogs.
