# Migrating Nust to Windows-Native

## Why

The current project runs on WSL2 and renders its GUI through WSLg into Windows. This causes:
- Software rendering workarounds (`LIBGL_ALWAYS_SOFTWARE=1`, `MESA_GL_VERSION_OVERRIDE=3.3`)
- Native file dialogs (`rfd`) failing, requiring fallback text-input dialogs
- Friction in the dev loop (run via `run_nust.sh`, not plain `cargo run`)

The egui/eframe stack itself is fine. The fix is to develop and run on Windows natively.
The GitHub Actions release builds already cross-compile for Windows and produce working binaries —
the dev workflow just never matched that.

---

## Migration Steps

### 1. Set up Rust on Windows

Install Rust for Windows from https://rustup.rs (the `.exe` installer).
Then in a Windows Terminal:

```powershell
rustup update stable
```

### 2. Create the new project

```powershell
cargo new nust
cd nust
```

Copy `Cargo.toml` dependencies from the old project — they are all cross-platform, nothing
needs changing.

Copy `src/main.rs` across, then apply the code changes described below.

### 3. Copy CI workflows

Copy `.github/workflows/rust.yml` and `.github/workflows/build-release.yml` verbatim.
They target stable Rust and build Linux/Windows/macOS release artifacts.

### 4. cargo run

```powershell
cargo run
```

No environment variables needed. `rfd` file dialogs work out of the box on Windows.

---

## Code Changes to main.rs

All changes are removals of WSL fallback code. Nothing in the core logic changes.

### A. Remove fallback-only fields from `App` struct

Delete these six fields:

```rust
manual_path: String,       // WSL workaround: manual path input in menu bar
save_as_path: String,      // WSL fallback dialog state
show_save_as_input: bool,  // WSL fallback dialog state
show_open_input: bool,     // WSL fallback dialog state
open_input_path: String,   // WSL fallback dialog state
open_to_left: bool,        // WSL fallback dialog state
```

Remove the corresponding entries from `App::default()`.

### B. Remove `AppAction::ManualSaveFocused`

Delete the variant from the enum, its arm in `perform_action()`, its entry in
`registered_actions()`, and the `manual_save()` method.

### C. Remove the fallback Save As dialog block from `update()`

Delete the entire block (currently ~lines 187–218):

```rust
// Save As dialog
if self.show_save_as_input {
    // ... inline text-input dialog ...
}
```

### D. Remove the fallback Open File dialog block from `update()`

Delete the entire block (currently ~lines 220–273):

```rust
// Open File dialog fallback
if self.show_open_input {
    // ... inline text-input dialog ...
}
```

### E. Remove the "Save to:" bar from the top menu in `update()`

Delete this section inside `update()` → top menu → `ui.horizontal_wrapped`:

```rust
ui.horizontal(|ui| {
    ui.label("Save to:");
    ui.text_edit_singleline(&mut self.manual_path);
    if ui.button("Save").clicked() {
        self.manual_save();
    }
});
ui.separator();
```

### F. Simplify `save_as_focused()`

The `None` arm currently falls back to the input dialog. Replace it with a simple cancellation:

```rust
fn save_as_focused(&mut self) {
    match rfd::FileDialog::new()
        .set_title("Save As")
        .add_filter("Text/Markdown", &["txt", "md", "log"])
        .add_filter("All Files", &["*"])
        .save_file()
    {
        Some(p) => self.save_to_path(p),
        None => self.status = "Save cancelled".into(),
    }
}
```

### G. Simplify `open_dialog()`

Same pattern — remove the `None` fallback arm:

```rust
fn open_dialog(&mut self, to_left: bool) {
    match rfd::FileDialog::new()
        .set_title("Open")
        .add_filter("Text/Markdown", &["txt", "md", "log"])
        .add_filter("All Files", &["*"])
        .pick_file()
    {
        Some(p) => {
            let target = if to_left { &mut self.left } else { &mut self.right };
            if let Err(e) = target.load_from(p) {
                self.status = format!("Open error: {e}");
            } else {
                self.status = "File opened".into();
                self.pending_focus = Some(if to_left { FocusedPane::Left } else { FocusedPane::Right });
                self.focused_pane = if to_left { FocusedPane::Left } else { FocusedPane::Right };
            }
        }
        None => self.status = "Open cancelled".into(),
    }
}
```

### H. Note: borderless window

`main()` has `with_decorations(false)`, which removes the title bar. On Windows native this means
the window has no drag handle and no system close button. You can drag it by holding Alt and
dragging anywhere, but you may want to add a title bar back or add a drag region. The Exit button
in the menu bar is the only close mechanism right now.

---

## What Does NOT Change

- `Pane` struct and all its methods — untouched
- All keyboard shortcuts and the command palette
- `quick_save_focused()` — works fine on Windows (uses `target/quick_saves/`)
- The `pane_widget()` function — untouched
- All layout logic (split view, single pane, focus switching)
- CI workflows
