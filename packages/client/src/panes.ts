import { createSession, deleteSession, getPane } from "./api.js";
import type { PaneStateInfo } from "./api.js";
import { createTerminalConnection } from "./terminal.js";
import type { TerminalConnection } from "./terminal.js";

interface PaneLeaf {
  type: "leaf";
  id: string;
  connection: TerminalConnection;
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

export interface PaneManager {
  splitVertical: () => Promise<void>;
  splitHorizontal: () => Promise<void>;
  navigate: (direction: "up" | "down" | "left" | "right") => void;
  closePane: (id: string) => void;
  getActiveConnection: () => TerminalConnection;
  dispose: () => void;
  readonly element: HTMLDivElement;
}

export interface CreatePaneManagerOptions {
  initialConnection: TerminalConnection;
  createConnection?: (sessionId: string) => TerminalConnection;
  onPaneClosed?: (sessionId: string) => void;
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

function createLeafElement(leaf: PaneLeaf, isActive: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "pane-leaf" + (isActive ? "" : " dimmed");
  el.dataset["paneId"] = leaf.id;
  el.appendChild(leaf.connection.element);

  const statusBar = document.createElement("div");
  statusBar.className = "pane-status-bar";
  el.appendChild(statusBar);
  leaf.statusBar = statusBar;

  leaf.element = el;
  return el;
}

function renderNode(node: PaneNode, activeId: string): HTMLDivElement {
  if (node.type === "leaf") return createLeafElement(node, node.id === activeId);

  const el = document.createElement("div");
  el.className = `pane-split pane-split-${node.direction}`;
  el.dataset["paneId"] = node.id;
  node.element = el;

  el.appendChild(renderNode(node.children[0], activeId));

  const divider = document.createElement("div");
  divider.className = `pane-divider pane-divider-${node.direction}`;
  el.appendChild(divider);

  el.appendChild(renderNode(node.children[1], activeId));
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

function renderState(state: PaneState, container: HTMLDivElement) {
  container.innerHTML = "";
  container.appendChild(renderNode(state.root, state.activeId));

  const activeLeaf = findLeaf(state.root, state.activeId);
  if (activeLeaf) {
    activeLeaf.connection.terminal.focus();
    if (activeLeaf.statusBar) {
      void getPane(activeLeaf.connection.sessionId).then((ps) => {
        if (activeLeaf.statusBar) renderStatusBar(activeLeaf.statusBar, ps);
      }).catch(() => {});
    }
  }
}

interface SplitParams {
  direction: "horizontal" | "vertical";
  newConnection: TerminalConnection;
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
    element: document.createElement("div"),
    statusBar: null,
  };
  newConnection.onExit = () => onExit(newLeafId);

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
  const sessionId = leaf.connection.sessionId;
  leaf.connection.dispose();
  if (opts.deleteServerSession) void deleteSession(sessionId);
  opts.onPaneClosed?.(sessionId);
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
}

async function doSplit(ctx: PaneContext, direction: "horizontal" | "vertical"): Promise<void> {
  const session = await createSession();
  performSplit(ctx.state, {
    direction,
    newConnection: ctx.createConn(session.sessionId),
    onExit: (id: string) => {
      if (performClose(ctx.state, id, ctx.exitOpts)) renderState(ctx.state, ctx.container);
    },
  });
  renderState(ctx.state, ctx.container);
}

function initPaneState(connection: TerminalConnection): { state: PaneState; initialId: string } {
  const initialId = nextPaneId();
  const state: PaneState = {
    root: { type: "leaf", id: initialId, connection, element: document.createElement("div"), statusBar: null },
    activeId: initialId,
  };
  return { state, initialId };
}

function disposeAllPanes(state: PaneState, container: HTMLDivElement): void {
  for (const leaf of allLeaves(state.root)) {
    leaf.connection.dispose();
    void deleteSession(leaf.connection.sessionId);
  }
  container.remove();
}

function navigatePane(state: PaneState, container: HTMLDivElement, direction: "up" | "down" | "left" | "right"): void {
  const target = findNavigationTarget(state.root, state.activeId, direction);
  if (!target) return;
  state.activeId = target.id;
  renderState(state, container);
}

export function createPaneManager(options: CreatePaneManagerOptions): PaneManager {
  const container = document.createElement("div");
  container.className = "pane-container";

  const { state, initialId } = initPaneState(options.initialConnection);
  const exitOpts: CloseOptions = { deleteServerSession: false, onPaneClosed: options.onPaneClosed };
  const manualOpts: CloseOptions = { deleteServerSession: true, onPaneClosed: options.onPaneClosed };
  const ctx: PaneContext = {
    state, container, createConn: options.createConnection ?? createTerminalConnection, exitOpts,
  };

  options.initialConnection.onExit = () => {
    if (performClose(state, initialId, exitOpts)) renderState(state, container);
  };
  renderState(state, container);

  return {
    splitVertical: () => doSplit(ctx, "vertical"),
    splitHorizontal: () => doSplit(ctx, "horizontal"),
    navigate: (direction) => navigatePane(state, container, direction),
    closePane: (id) => { if (performClose(state, id, manualOpts)) renderState(state, container); },
    getActiveConnection() {
      const leaf = findLeaf(state.root, state.activeId);
      if (!leaf) throw new Error("No active pane");
      return leaf.connection;
    },
    dispose: () => disposeAllPanes(state, container),
    element: container,
  };
}
