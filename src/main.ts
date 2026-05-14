import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

let currentPath: string | null = null;
let dirty = false;

const statusEl = document.getElementById("status")!;
const editorParent = document.getElementById("editor")!;

const onDocChange = EditorView.updateListener.of((v) => {
  if (v.docChanged && !dirty) {
    dirty = true;
    renderStatus();
  }
});

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "#1e1e1e", color: "#d4d4d4", height: "100%" },
    ".cm-content": { caretColor: "#fff" },
    ".cm-gutters": { backgroundColor: "#1e1e1e", color: "#666", border: "none" },
    ".cm-activeLine": { backgroundColor: "#252526" },
    ".cm-activeLineGutter": { backgroundColor: "#252526" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#fff" },
  },
  { dark: true },
);

const view = new EditorView({
  state: EditorState.create({
    doc: "",
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      markdown(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      onDocChange,
      theme,
    ],
  }),
  parent: editorParent,
});

function renderStatus(msg?: string) {
  if (msg !== undefined) {
    statusEl.textContent = msg;
    return;
  }
  const name = currentPath
    ? currentPath.split(/[\\/]/).pop() ?? currentPath
    : "untitled";
  statusEl.textContent = `${name}${dirty ? " •" : ""}`;
}

function setDoc(content: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
  });
}

async function openFile() {
  const picked = await openDialog({
    filters: [{ name: "Markdown/Text", extensions: ["md", "txt", "log"] }],
    multiple: false,
  });
  if (typeof picked !== "string") return;
  try {
    const content = await invoke<string>("read_file", { path: picked });
    setDoc(content);
    currentPath = picked;
    dirty = false;
    renderStatus();
  } catch (e) {
    renderStatus(`open error: ${e}`);
  }
}

async function writeCurrentTo(path: string) {
  const content = view.state.doc.toString();
  try {
    await invoke("write_file", { path, content });
    currentPath = path;
    dirty = false;
    renderStatus();
  } catch (e) {
    renderStatus(`save error: ${e}`);
  }
}

async function saveFile() {
  if (!currentPath) {
    return saveFileAs();
  }
  await writeCurrentTo(currentPath);
}

async function saveFileAs() {
  const picked = await saveDialog({
    filters: [{ name: "Markdown/Text", extensions: ["md", "txt", "log"] }],
    defaultPath: currentPath ?? undefined,
  });
  if (!picked) return;
  await writeCurrentTo(picked);
}

document.getElementById("open-btn")!.addEventListener("click", openFile);
document.getElementById("save-btn")!.addEventListener("click", saveFile);
document.getElementById("save-as-btn")!.addEventListener("click", saveFileAs);

window.addEventListener("keydown", (e) => {
  if (!e.ctrlKey) return;
  const key = e.key.toLowerCase();
  if (key === "s" && e.shiftKey) {
    e.preventDefault();
    saveFileAs();
  } else if (key === "s") {
    e.preventDefault();
    saveFile();
  } else if (key === "o") {
    e.preventDefault();
    openFile();
  }
});

renderStatus();
view.focus();
