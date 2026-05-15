import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

const MAX_PANES = 4;

interface Tab {
  id: string;
  path: string | null;
  name: string;
  state: EditorState;
  dirty: boolean;
}

interface Pane {
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
  view: EditorView;
  rootEl: HTMLElement;
  stripEl: HTMLElement;
  editorEl: HTMLElement;
}

type LayoutNode = LeafNode | SplitNode;
interface LeafNode {
  kind: "leaf";
  pane: Pane;
}
interface SplitNode {
  kind: "split";
  dir: "row" | "col";
  a: LayoutNode;
  b: LayoutNode;
  ratio: number;
}

let nextId = 1;
const newId = (prefix: string) => `${prefix}${nextId++}`;

let layout: LayoutNode;
const panes: Pane[] = [];
let activePaneId: string | null = null;

const statusEl = document.getElementById("status")!;
const workspaceEl = document.getElementById("workspace")!;

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "#1e1e1e", color: "#d4d4d4", height: "100%" },
    ".cm-content": { caretColor: "#fff" },
    ".cm-gutters": {
      backgroundColor: "#1e1e1e",
      color: "#666",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#252526" },
    ".cm-activeLineGutter": { backgroundColor: "#252526" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#fff" },
  },
  { dark: true },
);

function makeTabState(doc: string, tab: Tab): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      markdown(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((v) => {
        tab.state = v.state;
        if (v.docChanged && !tab.dirty) {
          tab.dirty = true;
          const pane = paneOfTab(tab.id);
          if (pane) renderStrip(pane);
          renderStatus();
        }
      }),
      theme,
    ],
  });
}

function makeTab(path: string | null, content: string): Tab {
  const tab: Tab = {
    id: newId("t"),
    path,
    name: path ? (path.split(/[\\/]/).pop() ?? path) : "untitled",
    state: EditorState.create({ doc: "" }),
    dirty: false,
  };
  tab.state = makeTabState(content, tab);
  return tab;
}

function paneOfTab(tabId: string): Pane | null {
  for (const p of panes) if (p.tabs.some((t) => t.id === tabId)) return p;
  return null;
}

function activePane(): Pane | null {
  return panes.find((p) => p.id === activePaneId) ?? panes[0] ?? null;
}

function activeTab(): Tab | null {
  const p = activePane();
  if (!p) return null;
  return p.tabs.find((t) => t.id === p.activeTabId) ?? null;
}

function createPane(): Pane {
  const rootEl = document.createElement("div");
  rootEl.className = "pane";

  const stripEl = document.createElement("div");
  stripEl.className = "tab-strip";

  const editorEl = document.createElement("div");
  editorEl.className = "pane-editor";

  rootEl.append(stripEl, editorEl);

  const view = new EditorView({
    state: EditorState.create({ doc: "" }),
    parent: editorEl,
  });

  const pane: Pane = {
    id: newId("p"),
    tabs: [],
    activeTabId: null,
    view,
    rootEl,
    stripEl,
    editorEl,
  };

  rootEl.addEventListener("mousedown", () => setActivePane(pane.id), true);

  return pane;
}

function collectPanes(node: LayoutNode = layout, out: Pane[] = []): Pane[] {
  if (node.kind === "leaf") out.push(node.pane);
  else {
    collectPanes(node.a, out);
    collectPanes(node.b, out);
  }
  return out;
}

function findLeaf(
  node: LayoutNode,
  paneId: string,
  parent: SplitNode | null = null,
  side: "a" | "b" | null = null,
): { leaf: LeafNode; parent: SplitNode | null; side: "a" | "b" | null } | null {
  if (node.kind === "leaf") {
    return node.pane.id === paneId ? { leaf: node, parent, side } : null;
  }
  return (
    findLeaf(node.a, paneId, node, "a") ||
    findLeaf(node.b, paneId, node, "b")
  );
}

function findParent(
  node: LayoutNode,
  target: LayoutNode,
): { parent: SplitNode; side: "a" | "b" } | null {
  if (node.kind === "leaf") return null;
  if (node.a === target) return { parent: node, side: "a" };
  if (node.b === target) return { parent: node, side: "b" };
  return findParent(node.a, target) || findParent(node.b, target);
}

function removeLeafFromLayout(paneId: string): boolean {
  const info = findLeaf(layout, paneId);
  if (!info || !info.parent) return false;
  const sibling = info.side === "a" ? info.parent.b : info.parent.a;
  if (layout === info.parent) {
    layout = sibling;
  } else {
    const gp = findParent(layout, info.parent);
    if (!gp) return false;
    if (gp.side === "a") gp.parent.a = sibling;
    else gp.parent.b = sibling;
  }
  return true;
}

function remount() {
  workspaceEl.innerHTML = "";
  panes.length = 0;
  collectPanes(layout, panes);
  mountNode(layout, workspaceEl);
  for (const p of panes) {
    p.rootEl.classList.toggle("active", p.id === activePaneId);
    renderStrip(p);
  }
  renderStatus();
  updateToolbar();
}

function mountNode(node: LayoutNode, parentEl: HTMLElement): HTMLElement {
  if (node.kind === "leaf") {
    node.pane.rootEl.style.flex = "1 1 0";
    parentEl.appendChild(node.pane.rootEl);
    return node.pane.rootEl;
  }
  const wrap = document.createElement("div");
  wrap.className = "split-wrap " + node.dir;
  wrap.style.flex = "1 1 0";
  parentEl.appendChild(wrap);

  const aEl = mountNode(node.a, wrap);
  aEl.style.flex = `${node.ratio} 1 0`;

  const resizer = document.createElement("div");
  resizer.className = node.dir === "row" ? "resizer vertical" : "resizer horizontal";
  wrap.appendChild(resizer);

  const bEl = mountNode(node.b, wrap);
  bEl.style.flex = `${1 - node.ratio} 1 0`;

  attachSplitResizer(resizer, node, aEl, bEl);
  return wrap;
}

function attachSplitResizer(
  el: HTMLElement,
  split: SplitNode,
  aEl: HTMLElement,
  bEl: HTMLElement,
) {
  el.addEventListener("mousedown", (e) => {
    e.preventDefault();
    el.classList.add("dragging");
    const horizontal = split.dir === "row";
    const start = horizontal ? e.clientX : e.clientY;
    const aRect = aEl.getBoundingClientRect();
    const bRect = bEl.getBoundingClientRect();
    const aSize = horizontal ? aRect.width : aRect.height;
    const bSize = horizontal ? bRect.width : bRect.height;
    const total = aSize + bSize;
    const onMove = (ev: MouseEvent) => {
      const pos = horizontal ? ev.clientX : ev.clientY;
      const newA = Math.max(80, Math.min(total - 80, aSize + (pos - start)));
      const frac = newA / total;
      split.ratio = frac;
      aEl.style.flex = `${frac} 1 0`;
      bEl.style.flex = `${1 - frac} 1 0`;
    };
    const onUp = () => {
      el.classList.remove("dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function setActivePane(paneId: string) {
  if (activePaneId === paneId) return;
  activePaneId = paneId;
  for (const p of panes) p.rootEl.classList.toggle("active", p.id === paneId);
  renderStatus();
  updateToolbar();
  const p = activePane();
  if (p) p.view.focus();
}

function setActiveTab(pane: Pane, tabId: string) {
  const tab = pane.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  pane.activeTabId = tabId;
  pane.view.setState(tab.state);
  renderStrip(pane);
  renderStatus();
  pane.view.focus();
}

function addTabToPane(pane: Pane, tab: Tab, activate = true) {
  pane.tabs.push(tab);
  if (activate) setActiveTab(pane, tab.id);
  else renderStrip(pane);
}

function closeTab(pane: Pane, tabId: string) {
  const idx = pane.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0) return;
  const tab = pane.tabs[idx];
  if (tab.dirty) {
    if (!confirm(`"${tab.name}" has unsaved changes. Discard?`)) return;
  }
  pane.tabs.splice(idx, 1);

  if (pane.tabs.length === 0) {
    if (panes.length > 1) {
      pane.view.destroy();
      removeLeafFromLayout(pane.id);
      activePaneId = null;
      remount();
      const next = panes[0] ?? null;
      if (next) {
        activePaneId = next.id;
        next.view.focus();
      }
      return;
    }
    pane.activeTabId = null;
    pane.view.setState(EditorState.create({ doc: "" }));
    renderStrip(pane);
    renderStatus();
    return;
  }

  if (pane.activeTabId === tabId) {
    const next = pane.tabs[idx] ?? pane.tabs[idx - 1] ?? null;
    if (next) setActiveTab(pane, next.id);
  } else {
    renderStrip(pane);
  }
}

function moveTab(
  fromPaneId: string,
  tabId: string,
  toPaneId: string,
  beforeTabId?: string,
) {
  const from = panes.find((p) => p.id === fromPaneId);
  const to = panes.find((p) => p.id === toPaneId);
  if (!from || !to) return;
  const idx = from.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0) return;
  if (from === to && from.tabs.length === 1) return;
  const [tab] = from.tabs.splice(idx, 1);

  if (from.activeTabId === tabId) {
    const next = from.tabs[idx] ?? from.tabs[idx - 1] ?? null;
    if (next) {
      from.activeTabId = next.id;
      from.view.setState(next.state);
    } else {
      from.activeTabId = null;
      from.view.setState(EditorState.create({ doc: "" }));
    }
  }

  let insertAt = to.tabs.length;
  if (beforeTabId && beforeTabId !== tabId) {
    const bi = to.tabs.findIndex((t) => t.id === beforeTabId);
    if (bi >= 0) insertAt = bi;
  }
  to.tabs.splice(insertAt, 0, tab);

  if (from.tabs.length === 0 && panes.length > 1 && from !== to) {
    from.view.destroy();
    removeLeafFromLayout(from.id);
    activePaneId = to.id;
    remount();
    setActiveTab(to, tab.id);
    return;
  }

  renderStrip(from);
  setActivePane(to.id);
  setActiveTab(to, tab.id);
}

type DropTarget =
  | { kind: "into"; pane: Pane }
  | { kind: "tab-insert"; pane: Pane; beforeTabId: string }
  | { kind: "split"; pane: Pane; side: "left" | "right" | "up" | "down" };

function computeDropTarget(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  const paneEl = el.closest(".pane") as HTMLElement | null;
  if (!paneEl) return null;
  const pane = panes.find((p) => p.rootEl === paneEl);
  if (!pane) return null;
  const tabEl = el.closest(".tab") as HTMLElement | null;
  if (tabEl && tabEl.dataset.tabId) {
    return { kind: "tab-insert", pane, beforeTabId: tabEl.dataset.tabId };
  }
  if (el.closest(".tab-strip")) {
    return { kind: "into", pane };
  }
  const rect = pane.editorEl.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    return { kind: "into", pane };
  }
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  const T = 0.25;
  const dL = fx,
    dR = 1 - fx,
    dT = fy,
    dB = 1 - fy;
  const m = Math.min(dL, dR, dT, dB);
  if (m < T) {
    if (m === dL) return { kind: "split", pane, side: "left" };
    if (m === dR) return { kind: "split", pane, side: "right" };
    if (m === dT) return { kind: "split", pane, side: "up" };
    return { kind: "split", pane, side: "down" };
  }
  return { kind: "into", pane };
}

function showDropZone(zone: HTMLElement, target: DropTarget | null) {
  if (!target) {
    zone.style.display = "none";
    return;
  }
  zone.style.display = "block";
  zone.classList.toggle("tab-insert", target.kind === "tab-insert");
  const r = target.pane.rootEl.getBoundingClientRect();
  if (target.kind === "into") {
    setBox(zone, r.left, r.top, r.width, r.height);
  } else if (target.kind === "tab-insert") {
    const tabEl = target.pane.stripEl.querySelector(
      `.tab[data-tab-id="${target.beforeTabId}"]`,
    ) as HTMLElement | null;
    if (!tabEl) return;
    const tr = tabEl.getBoundingClientRect();
    setBox(zone, tr.left - 1, tr.top, 3, tr.height);
  } else {
    switch (target.side) {
      case "left":
        setBox(zone, r.left, r.top, r.width / 2, r.height);
        break;
      case "right":
        setBox(zone, r.left + r.width / 2, r.top, r.width / 2, r.height);
        break;
      case "up":
        setBox(zone, r.left, r.top, r.width, r.height / 2);
        break;
      case "down":
        setBox(zone, r.left, r.top + r.height / 2, r.width, r.height / 2);
        break;
    }
  }
}

function setBox(el: HTMLElement, l: number, t: number, w: number, h: number) {
  el.style.left = `${l}px`;
  el.style.top = `${t}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
}

function dropTabIntoSplit(
  src: Pane,
  tab: Tab,
  targetPaneId: string,
  side: "left" | "right" | "up" | "down",
) {
  const fromOnlyTab = src.tabs.length === 1 && src.tabs[0].id === tab.id;
  const willRemoveSrc = fromOnlyTab && panes.length > 1;
  const effectiveCount = panes.length + 1 - (willRemoveSrc ? 1 : 0);
  if (effectiveCount > MAX_PANES) {
    moveTab(src.id, tab.id, targetPaneId);
    return;
  }
  const dir = side === "left" || side === "right" ? "row" : "col";
  const beforeAfter = side === "left" || side === "up" ? "before" : "after";
  const newPane = splitPane(targetPaneId, dir, beforeAfter);
  if (!newPane) return;

  const idx = src.tabs.findIndex((t) => t.id === tab.id);
  if (idx >= 0) {
    src.tabs.splice(idx, 1);
    if (src.activeTabId === tab.id) {
      const next = src.tabs[idx] ?? src.tabs[idx - 1] ?? null;
      if (next) {
        src.activeTabId = next.id;
        src.view.setState(next.state);
      } else {
        src.activeTabId = null;
        src.view.setState(EditorState.create({ doc: "" }));
      }
    }
  }
  newPane.tabs.push(tab);
  newPane.activeTabId = tab.id;

  if (src.tabs.length === 0 && willRemoveSrc) {
    src.view.destroy();
    removeLeafFromLayout(src.id);
  }

  activePaneId = newPane.id;
  remount();
  newPane.view.setState(tab.state);
  newPane.view.focus();
}

function beginTabDrag(srcPane: Pane, tab: Tab, startX: number, startY: number) {
  let ghost: HTMLElement | null = null;
  let zone: HTMLElement | null = null;
  let dragging = false;
  let lastTarget: DropTarget | null = null;
  const onMove = (ev: MouseEvent) => {
    if (!dragging) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (dx * dx + dy * dy < 25) return;
      dragging = true;
      ghost = document.createElement("div");
      ghost.className = "tab-ghost";
      ghost.textContent = tab.name;
      document.body.appendChild(ghost);
      zone = document.createElement("div");
      zone.className = "drop-zone";
      document.body.appendChild(zone);
    }
    ghost!.style.left = `${ev.clientX + 10}px`;
    ghost!.style.top = `${ev.clientY + 10}px`;
    lastTarget = computeDropTarget(ev.clientX, ev.clientY);
    showDropZone(zone!, lastTarget);
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (ghost) ghost.remove();
    if (zone) zone.remove();
    if (!dragging) return;
    const t = lastTarget;
    if (!t) return;
    if (t.kind === "split") {
      dropTabIntoSplit(srcPane, tab, t.pane.id, t.side);
    } else if (t.kind === "tab-insert") {
      moveTab(srcPane.id, tab.id, t.pane.id, t.beforeTabId);
    } else {
      moveTab(srcPane.id, tab.id, t.pane.id);
    }
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function renderStrip(pane: Pane) {
  pane.stripEl.innerHTML = "";
  for (const tab of pane.tabs) {
    const el = document.createElement("div");
    el.className = "tab" + (tab.id === pane.activeTabId ? " active" : "");
    el.title = tab.path ?? "untitled";
    el.dataset.tabId = tab.id;

    const dirty = document.createElement("span");
    dirty.className = "dirty";
    dirty.textContent = tab.dirty ? "●" : "";
    el.appendChild(dirty);

    const name = document.createElement("span");
    name.textContent = tab.name;
    el.appendChild(name);

    const close = document.createElement("span");
    close.className = "close";
    close.textContent = "×";
    close.addEventListener("mousedown", (e) => e.stopPropagation());
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(pane, tab.id);
    });
    el.appendChild(close);

    el.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(pane, tab.id);
        return;
      }
      if (e.button !== 0) return;
      setActivePane(pane.id);
      setActiveTab(pane, tab.id);
      beginTabDrag(pane, tab, e.clientX, e.clientY);
    });

    pane.stripEl.appendChild(el);
  }

  const newBtn = document.createElement("div");
  newBtn.className = "tab-new";
  newBtn.textContent = "+";
  newBtn.title = "New tab";
  newBtn.addEventListener("click", () => {
    setActivePane(pane.id);
    const t = makeTab(null, "");
    addTabToPane(pane, t);
  });
  pane.stripEl.appendChild(newBtn);
}

function renderStatus(msg?: string) {
  if (msg !== undefined) {
    statusEl.textContent = msg;
    return;
  }
  const t = activeTab();
  if (!t) {
    statusEl.textContent = "ready";
    return;
  }
  statusEl.textContent = `${t.name}${t.dirty ? " •" : ""}`;
}

function updateToolbar() {
  const atMax = panes.length >= MAX_PANES;
  (document.getElementById("split-right-btn") as HTMLButtonElement).disabled =
    atMax;
  (document.getElementById("split-down-btn") as HTMLButtonElement).disabled =
    atMax;
  (document.getElementById("close-pane-btn") as HTMLButtonElement).disabled =
    panes.length <= 1;
}

function splitPane(
  targetPaneId: string,
  dir: "row" | "col",
  side: "before" | "after",
): Pane | null {
  const info = findLeaf(layout, targetPaneId);
  if (!info) return null;
  const newPane = createPane();
  const newLeaf: LeafNode = { kind: "leaf", pane: newPane };
  const split: SplitNode = {
    kind: "split",
    dir,
    a: side === "before" ? newLeaf : info.leaf,
    b: side === "before" ? info.leaf : newLeaf,
    ratio: 0.5,
  };
  if (!info.parent) {
    layout = split;
  } else if (info.side === "a") {
    info.parent.a = split;
  } else {
    info.parent.b = split;
  }
  return newPane;
}

function splitActivePane(dir: "row" | "col") {
  if (panes.length >= MAX_PANES) return;
  const src = activePane();
  if (!src) return;
  const newPane = splitPane(src.id, dir, "after");
  if (!newPane) return;
  activePaneId = newPane.id;
  remount();
  addTabToPane(newPane, makeTab(null, ""));
}

function closeActivePane() {
  if (panes.length <= 1) return;
  const p = activePane();
  if (!p) return;
  for (const t of p.tabs) {
    if (t.dirty) {
      if (!confirm(`"${t.name}" has unsaved changes. Discard?`)) return;
    }
  }
  p.view.destroy();
  removeLeafFromLayout(p.id);
  activePaneId = null;
  remount();
  const next = panes[0] ?? null;
  if (next) {
    activePaneId = next.id;
    next.view.focus();
  }
}

async function openFile() {
  const p = activePane();
  if (!p) return;
  const picked = await openDialog({
    filters: [{ name: "Markdown/Text", extensions: ["md", "txt", "log"] }],
    multiple: true,
  });
  if (!picked) return;
  const paths = Array.isArray(picked) ? picked : [picked];
  for (const path of paths) {
    try {
      const content = await invoke<string>("read_file", { path });
      const t = makeTab(path, content);
      addTabToPane(p, t);
    } catch (e) {
      renderStatus(`open error: ${e}`);
    }
  }
}

async function saveFile() {
  const t = activeTab();
  if (!t) return;
  if (!t.path) return saveFileAs();
  await writeTabTo(t, t.path);
}

async function saveFileAs() {
  const t = activeTab();
  if (!t) return;
  const picked = await saveDialog({
    filters: [{ name: "Markdown/Text", extensions: ["md", "txt", "log"] }],
    defaultPath: t.path ?? t.name,
  });
  if (!picked) return;
  await writeTabTo(t, picked);
}

async function writeTabTo(tab: Tab, path: string) {
  const content = tab.state.doc.toString();
  try {
    await invoke("write_file", { path, content });
    tab.path = path;
    tab.name = path.split(/[\\/]/).pop() ?? path;
    tab.dirty = false;
    const pane = paneOfTab(tab.id);
    if (pane) renderStrip(pane);
    renderStatus();
  } catch (e) {
    renderStatus(`save error: ${e}`);
  }
}

function newTab() {
  const p = activePane();
  if (!p) return;
  const t = makeTab(null, "");
  addTabToPane(p, t);
}

document.getElementById("open-btn")!.addEventListener("click", openFile);
document.getElementById("save-btn")!.addEventListener("click", saveFile);
document.getElementById("save-as-btn")!.addEventListener("click", saveFileAs);
document.getElementById("new-tab-btn")!.addEventListener("click", newTab);
document
  .getElementById("split-right-btn")!
  .addEventListener("click", () => splitActivePane("row"));
document
  .getElementById("split-down-btn")!
  .addEventListener("click", () => splitActivePane("col"));
document
  .getElementById("close-pane-btn")!
  .addEventListener("click", closeActivePane);
document
  .getElementById("sidebar-toggle-btn")!
  .addEventListener("click", toggleSidebar);
document
  .getElementById("sidebar-open-btn")!
  .addEventListener("click", openFolderInSidebar);

window.addEventListener("keydown", (e) => {
  if (!e.ctrlKey) return;
  const key = e.key.toLowerCase();
  if (key === "p" && e.shiftKey) {
    e.preventDefault();
    openPalette();
    return;
  }
  if (key === "s" && e.shiftKey) {
    e.preventDefault();
    saveFileAs();
  } else if (key === "s") {
    e.preventDefault();
    saveFile();
  } else if (key === "o") {
    e.preventDefault();
    openFile();
  } else if (key === "n") {
    e.preventDefault();
    newTab();
  } else if (key === "w") {
    e.preventDefault();
    const p = activePane();
    if (p && p.activeTabId) closeTab(p, p.activeTabId);
  }
});

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void | Promise<void>;
}

function insertSnippet(template: string) {
  const p = activePane();
  if (!p) return;
  const sel = p.view.state.selection.main;
  const selText = p.view.state.sliceDoc(sel.from, sel.to);
  const withSel = template.replace("$SEL$", selText);
  const curMarker = "$CUR$";
  const curIdx = withSel.indexOf(curMarker);
  const final = withSel.replace(curMarker, "");
  const cursor = curIdx >= 0 ? sel.from + curIdx : sel.from + final.length;
  p.view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: final },
    selection: { anchor: cursor },
  });
  p.view.focus();
}

const TABLE_3X3 =
  "| Header 1 | Header 2 | Header 3 |\n" +
  "| -------- | -------- | -------- |\n" +
  "| $CUR$    |          |          |\n" +
  "|          |          |          |\n";

const commands: Command[] = [
  { id: "file.new", label: "File: New Tab", hint: "Ctrl+N", run: newTab },
  { id: "file.open", label: "File: Open...", hint: "Ctrl+O", run: openFile },
  { id: "file.save", label: "File: Save", hint: "Ctrl+S", run: saveFile },
  {
    id: "file.saveAs",
    label: "File: Save As...",
    hint: "Ctrl+Shift+S",
    run: saveFileAs,
  },
  {
    id: "file.closeTab",
    label: "File: Close Tab",
    hint: "Ctrl+W",
    run: () => {
      const p = activePane();
      if (p && p.activeTabId) closeTab(p, p.activeTabId);
    },
  },
  {
    id: "view.splitRight",
    label: "View: Split Pane Right",
    run: () => splitActivePane("row"),
  },
  {
    id: "view.splitDown",
    label: "View: Split Pane Down",
    run: () => splitActivePane("col"),
  },
  {
    id: "view.closePane",
    label: "View: Close Pane",
    run: closeActivePane,
  },
  {
    id: "view.toggleSidebar",
    label: "View: Toggle Sidebar",
    run: () => toggleSidebar(),
  },
  {
    id: "file.openFolder",
    label: "File: Open Folder...",
    run: () => openFolderInSidebar(),
  },
  {
    id: "insert.link",
    label: "Insert: Link",
    run: () => insertSnippet("[$SEL$]($CUR$)"),
  },
  {
    id: "insert.image",
    label: "Insert: Image",
    run: () => insertSnippet("![$SEL$]($CUR$)"),
  },
  {
    id: "insert.table",
    label: "Insert: Table (3×3)",
    run: () => insertSnippet(TABLE_3X3),
  },
  {
    id: "insert.codeBlock",
    label: "Insert: Code Block",
    run: () => insertSnippet("```\n$SEL$$CUR$\n```"),
  },
  {
    id: "insert.bold",
    label: "Insert: Bold",
    run: () => insertSnippet("**$SEL$$CUR$**"),
  },
  {
    id: "insert.italic",
    label: "Insert: Italic",
    run: () => insertSnippet("*$SEL$$CUR$*"),
  },
];

function fuzzyScore(query: string, label: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const s = label.toLowerCase();
  let qi = 0;
  let lastMatch = -1;
  let score = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) {
      score += lastMatch === i - 1 ? 5 : 1;
      lastMatch = i;
      qi++;
    }
  }
  if (qi < q.length) return 0;
  return score - lastMatch * 0.01;
}

const paletteEl = document.getElementById("palette")!;
const paletteInput = document.getElementById("palette-input") as HTMLInputElement;
const paletteList = document.getElementById("palette-list")!;
let paletteResults: Command[] = [];
let paletteSelected = 0;

function openPalette() {
  paletteEl.classList.remove("hidden");
  paletteInput.value = "";
  paletteSelected = 0;
  renderPalette();
  paletteInput.focus();
}

function closePalette() {
  paletteEl.classList.add("hidden");
  const p = activePane();
  if (p) p.view.focus();
}

function renderPalette() {
  const q = paletteInput.value.trim();
  paletteResults = commands
    .map((c) => ({ c, s: fuzzyScore(q, c.label) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
  if (paletteSelected >= paletteResults.length) paletteSelected = 0;
  paletteList.innerHTML = "";
  paletteResults.forEach((cmd, i) => {
    const li = document.createElement("li");
    if (i === paletteSelected) li.className = "selected";
    const label = document.createElement("span");
    label.textContent = cmd.label;
    li.appendChild(label);
    if (cmd.hint) {
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = cmd.hint;
      li.appendChild(hint);
    }
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      runPaletteCommand(i);
    });
    paletteList.appendChild(li);
  });
}

function runPaletteCommand(i: number) {
  const cmd = paletteResults[i];
  if (!cmd) return;
  closePalette();
  cmd.run();
}

paletteInput.addEventListener("input", () => {
  paletteSelected = 0;
  renderPalette();
});

paletteInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (paletteResults.length) {
      paletteSelected = (paletteSelected + 1) % paletteResults.length;
      renderPalette();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (paletteResults.length) {
      paletteSelected =
        (paletteSelected - 1 + paletteResults.length) % paletteResults.length;
      renderPalette();
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    runPaletteCommand(paletteSelected);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closePalette();
  }
});

interface DirEntryRaw {
  name: string;
  path: string;
  is_dir: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  expanded: boolean;
  children: TreeNode[] | null;
}

const sidebarEl = document.getElementById("sidebar")!;
const sidebarTitleEl = document.getElementById("sidebar-title")!;
const sidebarTreeEl = document.getElementById("sidebar-tree")!;
let sidebarRoot: TreeNode | null = null;

function toggleSidebar() {
  sidebarEl.classList.toggle("hidden");
}

async function openFolderInSidebar() {
  const picked = await openDialog({ directory: true, multiple: false });
  if (typeof picked !== "string") return;
  sidebarEl.classList.remove("hidden");
  const name = picked.split(/[\\/]/).pop() || picked;
  sidebarTitleEl.textContent = name;
  sidebarTitleEl.title = picked;
  sidebarRoot = {
    name,
    path: picked,
    isDir: true,
    expanded: true,
    children: null,
  };
  await loadChildren(sidebarRoot);
  renderTree();
}

async function loadChildren(node: TreeNode) {
  try {
    const raw = await invoke<DirEntryRaw[]>("list_dir", { path: node.path });
    node.children = raw.map((e) => ({
      name: e.name,
      path: e.path,
      isDir: e.is_dir,
      expanded: false,
      children: null,
    }));
  } catch (e) {
    node.children = [];
    renderStatus(`list error: ${e}`);
  }
}

function renderTree() {
  sidebarTreeEl.innerHTML = "";
  if (!sidebarRoot) return;
  if (sidebarRoot.children) renderNodes(sidebarRoot.children, 0, sidebarTreeEl);
}

function renderNodes(nodes: TreeNode[], depth: number, parentEl: HTMLElement) {
  for (const node of nodes) {
    const el = document.createElement("div");
    el.className = "tree-node";
    el.style.paddingLeft = `${4 + depth * 12}px`;
    el.title = node.path;

    const twirl = document.createElement("span");
    twirl.className = "twirl";
    twirl.textContent = node.isDir ? (node.expanded ? "▾" : "▸") : "";
    el.appendChild(twirl);

    const name = document.createElement("span");
    name.textContent = node.name;
    el.appendChild(name);

    el.addEventListener("click", async () => {
      if (node.isDir) {
        if (!node.children) await loadChildren(node);
        node.expanded = !node.expanded;
        renderTree();
      } else {
        await openOrFocusPath(node.path);
      }
    });

    parentEl.appendChild(el);

    if (node.isDir && node.expanded && node.children) {
      const childWrap = document.createElement("div");
      childWrap.className = "tree-children";
      renderNodes(node.children, depth + 1, childWrap);
      parentEl.appendChild(childWrap);
    }
  }
}

async function openOrFocusPath(path: string) {
  for (const pane of panes) {
    const t = pane.tabs.find((x) => x.path === path);
    if (t) {
      setActivePane(pane.id);
      setActiveTab(pane, t.id);
      return;
    }
  }
  const p = activePane();
  if (!p) return;
  await openPathIntoPane(p, path);
}

function paneAtPoint(x: number, y: number): Pane | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  const paneEl = el.closest(".pane") as HTMLElement | null;
  if (!paneEl) return null;
  return panes.find((p) => p.rootEl === paneEl) ?? null;
}

async function openPathIntoPane(pane: Pane, path: string) {
  try {
    const content = await invoke<string>("read_file", { path });
    addTabToPane(pane, makeTab(path, content));
  } catch (e) {
    renderStatus(`open error: ${e}`);
  }
}

getCurrentWebview().onDragDropEvent((event) => {
  const p = event.payload;
  if (p.type !== "drop") return;
  const target = paneAtPoint(p.position.x, p.position.y) ?? activePane();
  if (!target) return;
  setActivePane(target.id);
  for (const path of p.paths) openPathIntoPane(target, path);
});

const first = createPane();
layout = { kind: "leaf", pane: first };
activePaneId = first.id;
remount();
addTabToPane(first, makeTab(null, ""));
