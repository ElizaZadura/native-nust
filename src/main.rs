use anyhow::Result;
use eframe::{
    NativeOptions,
    egui::{self, KeyboardShortcut, Modifiers},
};
use std::{fs, path::PathBuf};

#[derive(Default)]
struct Pane {
    title: String,
    path: Option<PathBuf>,
    text: String,
    dirty: bool,
    scroll_offset: f32,
    scroll_viewport: f32,
    scroll_content: f32,
}

impl Pane {
    fn load_from(&mut self, p: PathBuf) -> Result<()> {
        self.text = fs::read_to_string(&p).unwrap_or_default();
        self.title = p
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        self.path = Some(p);
        self.dirty = false;
        self.scroll_offset = 0.0;
        self.scroll_viewport = 0.0;
        self.scroll_content = 0.0;
        Ok(())
    }
    fn save_as(&mut self, p: PathBuf) -> Result<()> {
        fs::write(&p, self.text.as_bytes())?;
        self.title = p
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        self.path = Some(p);
        self.dirty = false;
        self.scroll_offset = 0.0;
        self.scroll_viewport = 0.0;
        self.scroll_content = 0.0;
        Ok(())
    }
    fn save(&mut self) -> Result<()> {
        if let Some(p) = self.path.clone() {
            fs::write(p, self.text.as_bytes())?;
            self.dirty = false;
            Ok(())
        } else {
            Err(anyhow::anyhow!("no path"))
        }
    }
}

struct App {
    left: Pane,
    right: Pane,
    status: String,
    focused_pane: FocusedPane,
    show_split_view: bool,
    word_wrap: bool,
    actions: Vec<Action>,
    show_command_palette: bool,
    command_palette_query: String,
    command_palette_selected: usize,
    pending_focus: Option<FocusedPane>,
}

#[derive(PartialEq, Eq, Clone, Copy)]
enum FocusedPane {
    Left,
    Right,
}

#[derive(Clone, Copy)]
struct Action {
    id: &'static str,
    label: &'static str,
    shortcut: Option<KeyboardShortcut>,
    action: AppAction,
}

impl Action {
    const fn new(
        id: &'static str,
        label: &'static str,
        shortcut: Option<KeyboardShortcut>,
        action: AppAction,
    ) -> Self {
        Self {
            id,
            label,
            shortcut,
            action,
        }
    }
}

#[derive(Clone, Copy)]
enum AppAction {
    OpenFile,
    SaveFocused,
    SaveAsFocused,
    QuickSaveFocused,
    CloseFocused,
    FocusNextPane,
    FocusPreviousPane,
    ShowSplitView,
    ShowLeftOnly,
    ShowRightOnly,
    ToggleWordWrap,
}

impl Default for App {
    fn default() -> Self {
        Self {
            left: Pane {
                title: "left".into(),
                ..Default::default()
            },
            right: Pane {
                title: "right".into(),
                ..Default::default()
            },
            status: "ready".into(),
            focused_pane: FocusedPane::Left,
            show_split_view: true,
            word_wrap: false,
            actions: Self::registered_actions(),
            show_command_palette: false,
            command_palette_query: String::new(),
            command_palette_selected: 0,
            pending_focus: Some(FocusedPane::Left),
        }
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.process_shortcuts(ctx);
        self.handle_page_navigation(ctx);

        // Top menu
        egui::TopBottomPanel::top("menu").show(ctx, |ui| {
            ui.horizontal_wrapped(|ui| {
                if ui.button("📋 Command Palette").clicked() {
                    if self.show_command_palette {
                        self.close_command_palette();
                    } else {
                        self.open_command_palette();
                    }
                }
                ui.label("(Ctrl+Shift+P)");
                ui.separator();
                if ui.button("Exit").clicked() {
                    std::process::exit(0);
                }
            });
        });

        // Status bar
        egui::TopBottomPanel::bottom("status").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label(&self.status);
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let focused = if self.focused_pane == FocusedPane::Left {
                        "Left"
                    } else {
                        "Right"
                    };
                    ui.label(format!("Focused: {}", focused));
                });
            });
        });

        // Left / right panes
        let pending_focus = self.pending_focus;
        if self.show_split_view {
            egui::SidePanel::left("left")
                .resizable(true)
                .default_width(420.0)
                .show(ctx, |ui| {
                    let want_focus = pending_focus == Some(FocusedPane::Left);
                    if pane_widget(ui, &mut self.left, "left", want_focus, self.word_wrap) {
                        self.focused_pane = FocusedPane::Left;
                    }
                });
            egui::CentralPanel::default().show(ctx, |ui| {
                let want_focus = pending_focus == Some(FocusedPane::Right);
                if pane_widget(ui, &mut self.right, "right", want_focus, self.word_wrap) {
                    self.focused_pane = FocusedPane::Right;
                }
            });
        } else {
            egui::CentralPanel::default().show(ctx, |ui| match self.focused_pane {
                FocusedPane::Left => {
                    let want_focus = pending_focus == Some(FocusedPane::Left);
                    if pane_widget(ui, &mut self.left, "left", want_focus, self.word_wrap) {
                        self.focused_pane = FocusedPane::Left;
                    }
                }
                FocusedPane::Right => {
                    let want_focus = pending_focus == Some(FocusedPane::Right);
                    if pane_widget(ui, &mut self.right, "right", want_focus, self.word_wrap) {
                        self.focused_pane = FocusedPane::Right;
                    }
                }
            });
        }
        self.pending_focus = None;

        if self.show_command_palette {
            self.command_palette_ui(ctx);
        }
    }
}

fn format_shortcut(shortcut: &KeyboardShortcut) -> String {
    let mut parts: Vec<String> = Vec::new();
    if shortcut.modifiers.ctrl {
        parts.push("Ctrl".into());
    }
    if shortcut.modifiers.shift {
        parts.push("Shift".into());
    }
    if shortcut.modifiers.alt {
        parts.push("Alt".into());
    }
    if shortcut.modifiers.mac_cmd {
        parts.push("Cmd".into());
    }
    parts.push(format!("{:?}", shortcut.logical_key));
    parts.join("+")
}

fn pane_widget(
    ui: &mut egui::Ui,
    pane: &mut Pane,
    pane_id: &str,
    request_focus: bool,
    word_wrap: bool,
) -> bool {
    let title = if pane.dirty {
        format!("{} •", pane.title)
    } else {
        pane.title.clone()
    };
    ui.heading(title);
    ui.add_space(6.0);
    // Include word_wrap in the scroll ID so it gets recreated when word wrap changes
    let scroll_id = egui::Id::new(format!("pane_scroll_{pane_id}_{word_wrap}"));
    let mut had_focus = false;
    let output = egui::ScrollArea::vertical()
        .auto_shrink([false, false])
        .id_source(scroll_id)
        .vertical_scroll_offset(pane.scroll_offset)
        .show(ui, |ui| {
            // Get available width to ensure TextEdit fills the panel
            let available_width = ui.available_width();

            // Include word_wrap in the edit ID so egui knows to recreate the widget
            let edit_id = egui::Id::new(format!("pane_edit_{pane_id}_{word_wrap}"));

            let mut edit = egui::TextEdit::multiline(&mut pane.text)
                .code_editor()
                .desired_rows(30)
                .lock_focus(false)
                .id(edit_id);

            if word_wrap {
                // Word wrap: use available width so text wraps within the panel
                edit = edit.desired_width(available_width);
            } else {
                // No word wrap: use infinite width for horizontal scrolling
                edit = edit.desired_width(f32::INFINITY);
            }

            let resp = ui.add(edit);
            if request_focus {
                resp.request_focus();
            }
            if resp.changed() {
                pane.dirty = true;
            }
            had_focus = resp.has_focus();
        });
    pane.scroll_offset = output.state.offset.y;
    pane.scroll_viewport = output.inner_rect.height();
    pane.scroll_content = output.content_size.y;
    had_focus
}

impl App {
    fn registered_actions() -> Vec<Action> {
        let ctrl = Modifiers {
            ctrl: true,
            ..Default::default()
        };
        let ctrl_shift = Modifiers {
            ctrl: true,
            shift: true,
            ..Default::default()
        };
        let ctrl_alt = Modifiers {
            ctrl: true,
            alt: true,
            ..Default::default()
        };
        let ctrl_shift_tab = Modifiers {
            ctrl: true,
            shift: true,
            ..Default::default()
        };
        vec![
            Action::new(
                "open_file",
                "Open File (Focused Pane)",
                Some(KeyboardShortcut::new(ctrl, egui::Key::O)),
                AppAction::OpenFile,
            ),
            Action::new(
                "save_file",
                "Save",
                Some(KeyboardShortcut::new(ctrl, egui::Key::S)),
                AppAction::SaveFocused,
            ),
            Action::new(
                "save_file_as",
                "Save As",
                Some(KeyboardShortcut::new(ctrl_shift, egui::Key::S)),
                AppAction::SaveAsFocused,
            ),
            Action::new(
                "quick_save",
                "Quick Save",
                Some(KeyboardShortcut::new(ctrl_alt, egui::Key::S)),
                AppAction::QuickSaveFocused,
            ),
            Action::new(
                "close_file",
                "Close File (Focused Pane)",
                Some(KeyboardShortcut::new(ctrl, egui::Key::W)),
                AppAction::CloseFocused,
            ),
            Action::new(
                "focus_next",
                "Focus Next Pane",
                Some(KeyboardShortcut::new(ctrl, egui::Key::Tab)),
                AppAction::FocusNextPane,
            ),
            Action::new(
                "focus_previous",
                "Focus Previous Pane",
                Some(KeyboardShortcut::new(ctrl_shift_tab, egui::Key::Tab)),
                AppAction::FocusPreviousPane,
            ),
            Action::new(
                "layout_split",
                "Show Split View",
                Some(KeyboardShortcut::new(ctrl, egui::Key::Num3)),
                AppAction::ShowSplitView,
            ),
            Action::new(
                "layout_left",
                "Show Left Only",
                Some(KeyboardShortcut::new(ctrl, egui::Key::Num1)),
                AppAction::ShowLeftOnly,
            ),
            Action::new(
                "layout_right",
                "Show Right Only",
                Some(KeyboardShortcut::new(ctrl, egui::Key::Num2)),
                AppAction::ShowRightOnly,
            ),
            Action::new(
                "toggle_word_wrap",
                "Toggle Word Wrap",
                Some(KeyboardShortcut::new(
                    Modifiers {
                        ctrl: true,
                        alt: true,
                        ..Default::default()
                    },
                    egui::Key::W,
                )),
                AppAction::ToggleWordWrap,
            ),
        ]
    }

    fn command_palette_shortcut() -> KeyboardShortcut {
        KeyboardShortcut::new(
            Modifiers {
                ctrl: true,
                shift: true,
                ..Default::default()
            },
            egui::Key::P,
        )
    }

    fn process_shortcuts(&mut self, ctx: &egui::Context) {
        if ctx.input_mut(|i| i.consume_shortcut(&Self::command_palette_shortcut())) {
            if self.show_command_palette {
                self.close_command_palette();
                self.status = "Command palette closed".into();
            } else {
                self.open_command_palette();
            }
        }

        if self.show_command_palette {
            return;
        }

        let actions: Vec<Action> = self.actions.iter().copied().collect();
        for action in actions {
            if let Some(shortcut) = action.shortcut {
                if ctx.input_mut(|i| i.consume_shortcut(&shortcut)) {
                    self.perform_action(action.action);
                }
            }
        }
    }

    fn handle_page_navigation(&mut self, ctx: &egui::Context) {
        if self.show_command_palette {
            return;
        }
        let (page_down, page_up) = ctx.input_mut(|i| {
            let down = i.consume_key(Modifiers::NONE, egui::Key::PageDown);
            let up = i.consume_key(Modifiers::NONE, egui::Key::PageUp);
            (down, up)
        });
        if !page_down && !page_up {
            return;
        }
        let pane = if self.focused_pane == FocusedPane::Left {
            &mut self.left
        } else {
            &mut self.right
        };
        let viewport = pane.scroll_viewport.max(1.0);
        let max_offset = (pane.scroll_content - viewport).max(0.0);
        let page_delta = viewport * 0.9;
        if page_down {
            pane.scroll_offset = (pane.scroll_offset + page_delta).min(max_offset);
        }
        if page_up {
            pane.scroll_offset = (pane.scroll_offset - page_delta).max(0.0);
        }
    }

    fn open_command_palette(&mut self) {
        self.show_command_palette = true;
        self.command_palette_query.clear();
        self.command_palette_selected = 0;
        self.status = "Command palette opened (Ctrl+Shift+P or Esc to close)".into();
    }

    fn close_command_palette(&mut self) {
        self.show_command_palette = false;
        self.command_palette_query.clear();
        self.command_palette_selected = 0;
    }

    fn perform_action(&mut self, action: AppAction) {
        match action {
            AppAction::OpenFile => {
                self.open_dialog(self.focused_pane == FocusedPane::Left);
            }
            AppAction::SaveFocused => {
                self.save_focused(false);
            }
            AppAction::SaveAsFocused => {
                self.save_focused(true);
            }
            AppAction::QuickSaveFocused => {
                self.quick_save_focused();
            }
            AppAction::CloseFocused => {
                self.close_focused();
            }
            AppAction::FocusNextPane => {
                self.focused_pane = match self.focused_pane {
                    FocusedPane::Left => FocusedPane::Right,
                    FocusedPane::Right => FocusedPane::Left,
                };
                self.pending_focus = Some(self.focused_pane);
                self.status = format!(
                    "Focused {} pane",
                    if self.focused_pane == FocusedPane::Left {
                        "left"
                    } else {
                        "right"
                    }
                );
            }
            AppAction::FocusPreviousPane => {
                self.focused_pane = match self.focused_pane {
                    FocusedPane::Left => FocusedPane::Right,
                    FocusedPane::Right => FocusedPane::Left,
                };
                self.pending_focus = Some(self.focused_pane);
                self.status = format!(
                    "Focused {} pane",
                    if self.focused_pane == FocusedPane::Left {
                        "left"
                    } else {
                        "right"
                    }
                );
            }
            AppAction::ShowSplitView => {
                if !self.show_split_view {
                    self.show_split_view = true;
                    self.pending_focus = Some(self.focused_pane);
                    self.status = "Split view enabled".into();
                } else {
                    self.status = "Split view already active".into();
                }
            }
            AppAction::ShowLeftOnly => {
                self.show_split_view = false;
                self.focused_pane = FocusedPane::Left;
                self.pending_focus = Some(FocusedPane::Left);
                self.status = "Single pane mode (showing left)".into();
            }
            AppAction::ShowRightOnly => {
                self.show_split_view = false;
                self.focused_pane = FocusedPane::Right;
                self.pending_focus = Some(FocusedPane::Right);
                self.status = "Single pane mode (showing right)".into();
            }
            AppAction::ToggleWordWrap => {
                self.word_wrap = !self.word_wrap;
                self.status = if self.word_wrap {
                    "Word wrap enabled".into()
                } else {
                    "Word wrap disabled".into()
                };
                // Force repaint to update the UI
                // Note: egui should auto-repaint, but we can request it explicitly if needed
            }
        }
    }

    fn command_palette_ui(&mut self, ctx: &egui::Context) {
        use egui::Align2;

        let actions: Vec<Action> = {
            let query = self.command_palette_query.to_lowercase();
            self.actions
                .iter()
                .copied()
                .filter(|action| {
                    query.is_empty()
                        || action.label.to_lowercase().contains(query.as_str())
                        || action.id.contains(query.as_str())
                })
                .collect()
        };

        egui::Window::new("Command Palette")
            .pivot(Align2::CENTER_CENTER)
            .anchor(Align2::CENTER_CENTER, [0.0, 0.0])
            .collapsible(false)
            .resizable(false)
            .show(ctx, |ui| {
                ui.label("Type to filter commands. Enter runs the first result.");
                let text_response = ui.text_edit_singleline(&mut self.command_palette_query);
                if !text_response.has_focus() {
                    text_response.request_focus();
                }
                if text_response.changed() {
                    self.command_palette_selected = 0;
                }
                ui.separator();

                if actions.is_empty() {
                    ui.label("No matching commands.");
                } else {
                    if self.command_palette_selected >= actions.len() {
                        self.command_palette_selected = actions.len().saturating_sub(1);
                    }

                    let down = ctx.input(|i| i.key_pressed(egui::Key::ArrowDown));
                    let up = ctx.input(|i| i.key_pressed(egui::Key::ArrowUp));
                    if down {
                        self.command_palette_selected =
                            (self.command_palette_selected + 1) % actions.len();
                    } else if up {
                        if self.command_palette_selected == 0 {
                            self.command_palette_selected = actions.len() - 1;
                        } else {
                            self.command_palette_selected -= 1;
                        }
                    }

                    for (idx, action) in actions.iter().enumerate() {
                        let mut label = action.label.to_string();
                        if let Some(shortcut) = action.shortcut {
                            label.push_str(" (");
                            label.push_str(&format_shortcut(&shortcut));
                            label.push(')');
                        }
                        let resp = ui.selectable_label(idx == self.command_palette_selected, label);
                        if resp.clicked() {
                            self.command_palette_selected = idx;
                            self.perform_action(action.action);
                            self.close_command_palette();
                            return;
                        }
                    }

                    if ctx.input(|i| i.key_pressed(egui::Key::Enter)) {
                        if let Some(action) = actions.get(self.command_palette_selected) {
                            self.perform_action(action.action);
                            self.close_command_palette();
                        }
                    }
                }

                if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
                    self.close_command_palette();
                    self.status = "Command palette closed".into();
                }
            });
    }

    fn save_focused(&mut self, force_as: bool) {
        let (pane_name, target) = if self.focused_pane == FocusedPane::Left {
            ("left", &mut self.left)
        } else {
            ("right", &mut self.right)
        };

        if force_as || target.path.is_none() {
            self.save_as_focused();
        } else {
            self.status = format!("Saving to: {}", target.path.as_ref().unwrap().display());
            match target.save() {
                Ok(_) => self.status = format!("{} pane saved", pane_name),
                Err(e) => self.status = format!("Save error: {e}"),
            }
        }
    }

    fn save_as_focused(&mut self) {
        match rfd::FileDialog::new()
            .set_title("Save As")
            .add_filter("Text/Markdown", &["txt", "md", "log"])
            .add_filter("All Files", &["*"])
            .save_file()
        {
            Some(p) => {
                self.save_to_path(p);
            }
            None => {
                self.status = "Save cancelled".into();
            }
        }
    }

    fn save_to_path(&mut self, path: std::path::PathBuf) {
        let (pane_name, target) = if self.focused_pane == FocusedPane::Left {
            ("left", &mut self.left)
        } else {
            ("right", &mut self.right)
        };

        self.status = format!("Saving {} pane to: {}", pane_name, path.display());

        match target.save_as(path) {
            Ok(_) => self.status = format!("{} pane saved", pane_name),
            Err(e) => self.status = format!("Save error: {e}"),
        }
    }

    fn open_dialog(&mut self, to_left: bool) {
        self.status = "Opening file dialog...".into();

        match rfd::FileDialog::new()
            .set_title("Open")
            .add_filter("Text/Markdown", &["txt", "md", "log"])
            .add_filter("All Files", &["*"])
            .pick_file()
        {
            Some(p) => {
                let target = if to_left {
                    &mut self.left
                } else {
                    &mut self.right
                };
                self.status = format!("Loading: {}", p.display());
                if let Err(e) = target.load_from(p) {
                    self.status = format!("Open error: {e}");
                } else {
                    self.status = "File opened".into();
                    self.pending_focus = Some(if to_left {
                        FocusedPane::Left
                    } else {
                        FocusedPane::Right
                    });
                    self.focused_pane = if to_left {
                        FocusedPane::Left
                    } else {
                        FocusedPane::Right
                    };
                }
            }
            None => {
                self.status = "Open cancelled".into();
            }
        }
    }

    fn quick_save_focused(&mut self) {
        let (pane_name, target) = if self.focused_pane == FocusedPane::Left {
            ("left", &mut self.left)
        } else {
            ("right", &mut self.right)
        };

        let mut quick_save_dir = std::env::current_dir()
            .map(|dir| dir.join("target").join("quick_saves"))
            .unwrap_or_else(|_| std::env::temp_dir().join("nust_quick_saves"));
        if let Err(primary_err) = fs::create_dir_all(&quick_save_dir) {
            let fallback_dir = std::env::temp_dir().join("nust_quick_saves");
            if quick_save_dir != fallback_dir {
                match fs::create_dir_all(&fallback_dir) {
                    Ok(_) => quick_save_dir = fallback_dir,
                    Err(fallback_err) => {
                        self.status = format!(
                            "Quick save failed: {primary_err}; fallback failed: {fallback_err}"
                        );
                        return;
                    }
                }
            } else {
                self.status = format!("Quick save failed: {primary_err}");
                return;
            }
        }

        // Quick save without file dialog - save to a timestamped file
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let filename = format!("nust_{}_{}.txt", pane_name, timestamp);
        let save_path = quick_save_dir.join(filename);

        self.status = format!(
            "Quick saving {} pane to {}...",
            pane_name,
            save_path.display()
        );

        match target.save_as(save_path.clone()) {
            Ok(_) => {
                self.status = format!(
                    "{} pane quick save successful: {}",
                    pane_name,
                    save_path.display()
                )
            }
            Err(e) => self.status = format!("Quick save failed: {e}"),
        };
    }

    fn close_focused(&mut self) {
        let (pane_name, target, default_title) = if self.focused_pane == FocusedPane::Left {
            ("left", &mut self.left, "left")
        } else {
            ("right", &mut self.right, "right")
        };

        target.text.clear();
        target.path = None;
        target.dirty = false;
        target.title = default_title.into();
        target.scroll_offset = 0.0;
        target.scroll_viewport = 0.0;
        target.scroll_content = 0.0;

        self.status = format!("{pane_name} pane cleared");
        self.pending_focus = Some(self.focused_pane);
    }
}

fn main() -> Result<()> {
    let opts = NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_decorations(false)
            .with_resizable(true)
            .with_inner_size([1000.0, 700.0]),
        ..Default::default()
    };
    eframe::run_native("Nust", opts, Box::new(|_| Box::new(App::default())))
        .map_err(|e| anyhow::anyhow!("eframe error: {}", e))?;
    Ok(())
}
