import { deleteSession, getPane } from "./api.js";
import type { PaneStateInfo } from "./api.js";
import { createTerminalConnection } from "./terminal.js";
import type { TerminalConnection } from "./terminal.js";

interface PaneLeaf {
  type: "leaf";
  id: string;
  connection: TerminalConnection | null;
  launcher: HTMLDivElement | null;
  element: HTMLDivElement;
  statusBar: HTMLDivElement | null;
}

interface PaneSplit {
  type: "split";
  id: string;
  direction: "horizontal" | "vertical";
  children: [PaneNode, PaneNode];
  element: HTMLDivElement;
}

type PaneNode = PaneLeaf | PaneSplit;

export interface PickerItem {
  id: string;
  label: string;
  detail?: string;
}

export interface PaneManager {
  splitVertical: () => void;
  splitHorizontal: () => void;
  navigate: (direction: "up" | "down" | "left" | "right") => void;
  closePane: (id: string) => void;
  activatePane: (id: string, connection: TerminalConnection) => void;
  showPickerInPane: (paneId: string, title: string, items: PickerItem[], onSelect: (id: string) => void, onBack: () => void) => void;
  restoreLauncherInPane: (paneId: string) => void;
  getActiveConnection: () => TerminalConnection | null;
  dispose: () => void;
  readonly element: HTMLDivElement;
}

export interface CreatePaneManagerOptions {
  initialConnection: TerminalConnection | null;
  createConnection?: (sessionId: string) => TerminalConnection;
  onPaneClosed?: (sessionId: string) => void;
  onLauncherSelect?: (paneId: string) => void;
  onClaudeSelect?: (paneId: string) => void;
  onActionSelect?: (paneId: string) => void;
}

let paneIdCounter = 0;

function nextPaneId(): string {
  return `pane-${++paneIdCounter}`;
}

function findLeaf(node: PaneNode, id: string): PaneLeaf | null {
  if (node.type === "leaf") return node.id === id ? node : null;
  return findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id);
}

function findParent(root: PaneNode, id: string): PaneSplit | null {
  if (root.type === "leaf") return null;
  for (const child of root.children) {
    if (child.id === id) return root;
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

function firstLeaf(node: PaneNode): PaneLeaf {
  if (node.type === "leaf") return node;
  return firstLeaf(node.children[0]);
}

function lastLeaf(node: PaneNode): PaneLeaf {
  if (node.type === "leaf") return node;
  return lastLeaf(node.children[1]);
}

function allLeaves(node: PaneNode): PaneLeaf[] {
  if (node.type === "leaf") return [node];
  return [...allLeaves(node.children[0]), ...allLeaves(node.children[1])];
}

function directionToSplit(direction: "up" | "down" | "left" | "right"): "vertical" | "horizontal" {
  return direction === "left" || direction === "right" ? "vertical" : "horizontal";
}

function isBackward(direction: "up" | "down" | "left" | "right"): boolean {
  return direction === "left" || direction === "up";
}

function childIndex(parent: PaneSplit, childId: string): 0 | 1 {
  return parent.children[0].id === childId ? 0 : 1;
}

interface NavQuery {
  splitDir: "vertical" | "horizontal";
  backward: boolean;
}

function matchSplitForward(parent: PaneSplit, current: string): PaneLeaf | null {
  return childIndex(parent, current) === 0 ? firstLeaf(parent.children[1]) : null;
}

function matchSplitBackward(parent: PaneSplit, current: string): PaneLeaf | null {
  return childIndex(parent, current) === 1 ? lastLeaf(parent.children[0]) : null;
}

function matchSplitTarget(parent: PaneSplit, current: string, query: NavQuery): PaneLeaf | null {
  if (parent.direction !== query.splitDir) return null;
  return query.backward ? matchSplitBackward(parent, current) : matchSplitForward(parent, current);
}

function findNavigationTarget(
  root: PaneNode,
  activeId: string,
  direction: "up" | "down" | "left" | "right",
): PaneLeaf | null {
  const query: NavQuery = { splitDir: directionToSplit(direction), backward: isBackward(direction) };
  let current = activeId;

  for (let parent = findParent(root, current); parent; parent = findParent(root, current)) {
    const target = matchSplitTarget(parent, current, query);
    if (target) return target;
    current = parent.id;
  }
  return null;
}

function renderStatusBar(statusBar: HTMLDivElement, paneState: PaneStateInfo): void {
  statusBar.innerHTML = "";

  if (paneState.pendingStdin) {
    const badge = document.createElement("span");
    badge.className = "pane-status-stdin";
    badge.textContent = "stdin";
    statusBar.appendChild(badge);
  }

  for (const note of paneState.notes) {
    const noteEl = document.createElement("span");
    noteEl.className = "pane-status-note";
    noteEl.textContent = note;
    statusBar.appendChild(noteEl);
  }
}

interface LauncherCallbacks {
  onLauncherSelect: (paneId: string) => void;
  onClaudeSelect: (paneId: string) => void;
  onActionSelect: (paneId: string) => void;
}

function createPickerElement(title: string, items: PickerItem[], onSelect: (id: string) => void, onBack: () => void): HTMLDivElement {
  const picker = document.createElement("div");
  picker.className = "pane-launcher";

  const header = document.createElement("div");
  header.className = "pane-picker-header";

  const backBtn = document.createElement("button");
  backBtn.className = "pane-launcher-button pane-picker-back";
  backBtn.textContent = "Back";
  backBtn.addEventListener("click", onBack);
  header.appendChild(backBtn);

  const titleEl = document.createElement("span");
  titleEl.className = "pane-picker-title";
  titleEl.textContent = title;
  header.appendChild(titleEl);

  picker.appendChild(header);

  const list = document.createElement("div");
  list.className = "pane-picker-list";

  for (const item of items) {
    const btn = document.createElement("button");
    btn.className = "pane-picker-item";
    btn.dataset["pickerId"] = item.id;
    const labelSpan = document.createElement("span");
    labelSpan.className = "pane-picker-item-label";
    labelSpan.textContent = item.label;
    btn.appendChild(labelSpan);
    if (item.detail) {
      const detailSpan = document.createElement("span");
      detailSpan.className = "pane-picker-item-detail";
      detailSpan.textContent = item.detail;
      btn.appendChild(detailSpan);
    }
    btn.addEventListener("click", () => onSelect(item.id));
    list.appendChild(btn);
  }

  picker.appendChild(list);
  return picker;
}

function createLauncherElement(paneId: string, callbacks: LauncherCallbacks): HTMLDivElement {
  const launcher = document.createElement("div");
  launcher.className = "pane-launcher";

  const claudeBtn = document.createElement("button");
  claudeBtn.className = "pane-launcher-button";
  claudeBtn.textContent = "Start Claude Code";
  claudeBtn.addEventListener("click", () => callbacks.onClaudeSelect(paneId));
  launcher.appendChild(claudeBtn);

  const actionBtn = document.createElement("button");
  actionBtn.className = "pane-launcher-button";
  actionBtn.textContent = "Trigger action";
  actionBtn.addEventListener("click", () => callbacks.onActionSelect(paneId));
  launcher.appendChild(actionBtn);

  const blankBtn = document.createElement("button");
  blankBtn.className = "pane-launcher-button";
  blankBtn.textContent = "Blank terminal";
  blankBtn.addEventListener("click", () => callbacks.onLauncherSelect(paneId));
  launcher.appendChild(blankBtn);

  return launcher;
}

function createLeafElement(leaf: PaneLeaf, isActive: boolean, launcherCallbacks: LauncherCallbacks | null): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "pane-leaf" + (isActive ? "" : " dimmed");
  el.dataset["paneId"] = leaf.id;

  if (leaf.connection) {
    el.appendChild(leaf.connection.element);
  } else if (launcherCallbacks) {
    const launcher = createLauncherElement(leaf.id, launcherCallbacks);
    leaf.launcher = launcher;
    el.appendChild(launcher);
  }

  const statusBar = document.createElement("div");
  statusBar.className = "pane-status-bar";
  el.appendChild(statusBar);
  leaf.statusBar = statusBar;

  leaf.element = el;
  return el;
}

function renderNode(node: PaneNode, activeId: string, launcherCallbacks: LauncherCallbacks | null): HTMLDivElement {
  if (node.type === "leaf") return createLeafElement(node, node.id === activeId, launcherCallbacks);

  const el = document.createElement("div");
  el.className = `pane-split pane-split-${node.direction}`;
  el.dataset["paneId"] = node.id;
  node.element = el;

  el.appendChild(renderNode(node.children[0], activeId, launcherCallbacks));

  const divider = document.createElement("div");
  divider.className = `pane-divider pane-divider-${node.direction}`;
  el.appendChild(divider);

  el.appendChild(renderNode(node.children[1], activeId, launcherCallbacks));
  return el;
}

function replaceChild(root: PaneNode, targetId: string, replacement: PaneNode): PaneNode {
  if (root.id === targetId) return replacement;
  if (root.type === "leaf") return root;
  const parent = findParent(root, targetId);
  if (parent) {
    parent.children[childIndex(parent, targetId)] = replacement;
  }
  return root;
}

interface PaneState {
  root: PaneNode;
  activeId: string;
}

function renderState(state: PaneState, container: HTMLDivElement, launcherCallbacks: LauncherCallbacks | null) {
  container.innerHTML = "";
  container.appendChild(renderNode(state.root, state.activeId, launcherCallbacks));

  const activeLeaf = findLeaf(state.root, state.activeId);
  if (activeLeaf) {
    if (activeLeaf.connection) {
      activeLeaf.connection.terminal.focus();
      if (activeLeaf.statusBar) {
        void getPane(activeLeaf.connection.sessionId).then((ps) => {
          if (activeLeaf.statusBar) renderStatusBar(activeLeaf.statusBar, ps);
        }).catch(() => {});
      }
    }
  }
}

interface SplitParams {
  direction: "horizontal" | "vertical";
  newConnection: TerminalConnection | null;
  onExit: (id: string) => void;
}

function performSplit(state: PaneState, params: SplitParams): string {
  const { direction, newConnection, onExit } = params;
  const activeLeaf = findLeaf(state.root, state.activeId);
  if (!activeLeaf) return state.activeId;

  const newLeafId = nextPaneId();
  const newLeaf: PaneLeaf = {
    type: "leaf",
    id: newLeafId,
    connection: newConnection,
    launcher: null,
    element: document.createElement("div"),
    statusBar: null,
  };
  if (newConnection) {
    newConnection.onExit = () => onExit(newLeafId);
  }

  const splitNode: PaneSplit = {
    type: "split",
    id: nextPaneId(),
    direction,
    children: [activeLeaf, newLeaf],
    element: document.createElement("div"),
  };

  state.root = replaceChild(state.root, activeLeaf.id, splitNode);
  state.activeId = newLeafId;
  return newLeafId;
}

interface CloseOptions {
  deleteServerSession?: boolean | undefined;
  onPaneClosed?: ((sessionId: string) => void) | undefined;
}

function disposeLeaf(leaf: PaneLeaf, opts: CloseOptions): void {
  if (leaf.connection) {
    const sessionId = leaf.connection.sessionId;
    leaf.connection.dispose();
    if (opts.deleteServerSession) void deleteSession(sessionId);
    opts.onPaneClosed?.(sessionId);
  }
}

function removePaneFromTree(state: PaneState, id: string): boolean {
  const parent = findParent(state.root, id);
  if (!parent) return false;

  const sibling = parent.children[childIndex(parent, id) === 0 ? 1 : 0];
  state.root = replaceChild(state.root, parent.id, sibling);

  if (state.activeId === id) {
    state.activeId = firstLeaf(sibling).id;
  }
  return true;
}

function performClose(state: PaneState, id: string, opts: CloseOptions): boolean {
  const leaf = findLeaf(state.root, id);
  if (!leaf || state.root.type === "leaf") return false;

  disposeLeaf(leaf, opts);
  return removePaneFromTree(state, id);
}

interface PaneContext {
  state: PaneState;
  container: HTMLDivElement;
  createConn: (sessionId: string) => TerminalConnection;
  exitOpts: CloseOptions;
  launcherCallbacks: LauncherCallbacks | null;
}

function doSplit(ctx: PaneContext, direction: "horizontal" | "vertical"): void {
  performSplit(ctx.state, {
    direction,
    newConnection: null,
    onExit: (id: string) => {
      if (performClose(ctx.state, id, ctx.exitOpts)) renderState(ctx.state, ctx.container, ctx.launcherCallbacks);
    },
  });
  renderState(ctx.state, ctx.container, ctx.launcherCallbacks);
}

function initPaneState(connection: TerminalConnection | null): { state: PaneState; initialId: string } {
  const initialId = nextPaneId();
  const state: PaneState = {
    root: { type: "leaf", id: initialId, connection, launcher: null, element: document.createElement("div"), statusBar: null },
    activeId: initialId,
  };
  return { state, initialId };
}

function disposeAllPanes(state: PaneState, container: HTMLDivElement): void {
  for (const leaf of allLeaves(state.root)) {
    if (leaf.connection) {
      leaf.connection.dispose();
      void deleteSession(leaf.connection.sessionId);
    }
  }
  container.remove();
}

function navigatePane(state: PaneState, container: HTMLDivElement, direction: "up" | "down" | "left" | "right", launcherCallbacks: LauncherCallbacks | null): void {
  const target = findNavigationTarget(state.root, state.activeId, direction);
  if (!target) return;
  state.activeId = target.id;
  renderState(state, container, launcherCallbacks);
}

export function createPaneManager(options: CreatePaneManagerOptions): PaneManager {
  const container = document.createElement("div");
  container.className = "pane-container";

  const { state, initialId } = initPaneState(options.initialConnection);
  const exitOpts: CloseOptions = { deleteServerSession: false, onPaneClosed: options.onPaneClosed };
  const manualOpts: CloseOptions = { deleteServerSession: true, onPaneClosed: options.onPaneClosed };

  const launcherCallbacks: LauncherCallbacks | null =
    options.onLauncherSelect && options.onClaudeSelect && options.onActionSelect
      ? { onLauncherSelect: options.onLauncherSelect, onClaudeSelect: options.onClaudeSelect, onActionSelect: options.onActionSelect }
      : null;

  const ctx: PaneContext = {
    state, container, createConn: options.createConnection ?? createTerminalConnection, exitOpts, launcherCallbacks,
  };

  if (options.initialConnection) {
    options.initialConnection.onExit = () => {
      if (performClose(state, initialId, exitOpts)) renderState(state, container, launcherCallbacks);
    };
  }
  renderState(state, container, launcherCallbacks);

  return {
    splitVertical: () => doSplit(ctx, "vertical"),
    splitHorizontal: () => doSplit(ctx, "horizontal"),
    navigate: (direction) => navigatePane(state, container, direction, launcherCallbacks),
    closePane: (id) => { if (performClose(state, id, manualOpts)) renderState(state, container, launcherCallbacks); },
    showPickerInPane(paneId: string, title: string, items: PickerItem[], onSelect: (id: string) => void, onBack: () => void) {
      const leaf = findLeaf(state.root, paneId);
      if (!leaf) return;
      if (leaf.launcher) {
        leaf.launcher.remove();
      }
      const picker = createPickerElement(title, items, onSelect, onBack);
      leaf.launcher = picker;
      leaf.element.insertBefore(picker, leaf.statusBar);
    },
    restoreLauncherInPane(paneId: string) {
      const leaf = findLeaf(state.root, paneId);
      if (!leaf) return;
      if (leaf.launcher) {
        leaf.launcher.remove();
      }
      if (launcherCallbacks) {
        const launcher = createLauncherElement(paneId, launcherCallbacks);
        leaf.launcher = launcher;
        leaf.element.insertBefore(launcher, leaf.statusBar);
      }
    },
    activatePane(id: string, connection: TerminalConnection) {
      const leaf = findLeaf(state.root, id);
      if (!leaf) return;
      if (leaf.launcher) {
        leaf.launcher.remove();
        leaf.launcher = null;
      }
      leaf.connection = connection;
      connection.onExit = () => {
        if (performClose(state, id, exitOpts)) renderState(state, container, launcherCallbacks);
      };
      renderState(state, container, launcherCallbacks);
    },
    getActiveConnection() {
      const leaf = findLeaf(state.root, state.activeId);
      if (!leaf) return null;
      return leaf.connection;
    },
    dispose: () => disposeAllPanes(state, container),
    element: container,
  };
}
