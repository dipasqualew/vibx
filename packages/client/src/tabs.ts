import { createSession, listSessions, listPanes, getPane, updatePane } from "./api.js";
import { createTerminalConnection } from "./terminal.js";
import { createPaneManager } from "./panes.js";
import type { PaneManager } from "./panes.js";

interface Tab {
  id: string;
  sessionId: string;
  label: string;
  bell: boolean;
  paneManager: PaneManager;
  tabElement: HTMLDivElement;
}

export interface TabManager {
  addTab: () => Promise<void>;
  restoreOrAddTab: () => Promise<void>;
  closeTab: (id: string) => void;
  switchToTab: (id: string) => void;
  nextTab: () => void;
  prevTab: () => void;
  splitVertical: () => Promise<void>;
  splitHorizontal: () => Promise<void>;
  navigate: (direction: "up" | "down" | "left" | "right") => void;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  tabCounter: number;
}

interface TabDom {
  tabBar: HTMLDivElement;
  terminalArea: HTMLDivElement;
  addButton: HTMLButtonElement;
}

interface TabCallbacks {
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
}

function renderTabElement(tab: Tab, activeTabId: string | null, cbs: TabCallbacks): HTMLDivElement {
  const tabEl = document.createElement("div");
  tabEl.className = "tab" + (tab.id === activeTabId ? " active" : "");

  if (tab.bell) {
    const bellIndicator = document.createElement("span");
    bellIndicator.className = "tab-bell";
    bellIndicator.textContent = "\u2022";
    tabEl.appendChild(bellIndicator);
  }

  const label = document.createElement("span");
  label.className = "tab-label";
  label.textContent = tab.label;
  label.addEventListener("click", () => cbs.onSwitch(tab.id));
  tabEl.appendChild(label);

  const closeBtn = document.createElement("button");
  closeBtn.className = "tab-close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    cbs.onClose(tab.id);
  });
  tabEl.appendChild(closeBtn);

  tab.tabElement = tabEl;
  return tabEl;
}

function renderAllTabs(state: TabState, dom: TabDom, cbs: TabCallbacks): void {
  for (const child of Array.from(dom.tabBar.children)) {
    if (child !== dom.addButton) child.remove();
  }
  for (const tab of state.tabs) {
    dom.tabBar.insertBefore(renderTabElement(tab, state.activeTabId, cbs), dom.addButton);
  }
}

function switchTab(state: TabState, id: string): void {
  state.activeTabId = id;
  for (const tab of state.tabs) {
    const isActive = tab.id === id;
    tab.paneManager.element.style.display = isActive ? "flex" : "none";
    if (isActive) {
      tab.paneManager.getActiveConnection().terminal.focus();
      if (tab.bell) {
        tab.bell = false;
        void updatePane(tab.sessionId, { bell: false });
      }
    }
  }
}

function cycleTab(state: TabState, offset: number): string | null {
  if (state.tabs.length <= 1) return null;
  const index = state.tabs.findIndex((t) => t.id === state.activeTabId);
  const next = (index + offset + state.tabs.length) % state.tabs.length;
  return state.tabs[next]!.id;
}

function createTabDom(container: HTMLElement, onAdd: () => void): TabDom {
  const tabBar = document.createElement("div");
  tabBar.className = "tab-bar";
  container.appendChild(tabBar);

  const terminalArea = document.createElement("div");
  terminalArea.className = "terminal-area";
  container.appendChild(terminalArea);

  const addButton = document.createElement("button");
  addButton.className = "tab-add";
  addButton.textContent = "+";
  addButton.addEventListener("click", onAdd);
  tabBar.appendChild(addButton);

  return { tabBar, terminalArea, addButton };
}

async function fetchTabLabel(sessionId: string, fallback: string): Promise<string> {
  try {
    const paneState = await getPane(sessionId);
    return paneState.title || fallback;
  } catch {
    return fallback;
  }
}

async function addNewTab(state: TabState, terminalArea: HTMLDivElement): Promise<string> {
  state.tabCounter++;
  const session = await createSession();
  const pm = createPaneManager({ initialConnection: createTerminalConnection(session.sessionId) });
  terminalArea.appendChild(pm.element);
  const id = `tab-${state.tabCounter}`;
  const label = await fetchTabLabel(session.sessionId, `Terminal ${state.tabCounter}`);
  state.tabs.push({ id, sessionId: session.sessionId, label, bell: false, paneManager: pm, tabElement: document.createElement("div") });
  return id;
}

function restoreExistingTab(state: TabState, terminalArea: HTMLDivElement, sessionId: string): string {
  state.tabCounter++;
  const pm = createPaneManager({ initialConnection: createTerminalConnection(sessionId) });
  terminalArea.appendChild(pm.element);
  const id = `tab-${state.tabCounter}`;
  state.tabs.push({ id, sessionId, label: `Terminal ${state.tabCounter}`, bell: false, paneManager: pm, tabElement: document.createElement("div") });
  return id;
}

interface TabActions {
  switchFn: (id: string) => void;
  renderFn: () => void;
}

function removeTab(state: TabState, id: string, actions: TabActions): void {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index === -1) return;
  state.tabs[index]!.paneManager.dispose();
  state.tabs.splice(index, 1);
  if (state.activeTabId === id && state.tabs.length > 0) {
    actions.switchFn(state.tabs[Math.min(index, state.tabs.length - 1)]!.id);
    return;
  }
  if (state.tabs.length === 0) state.activeTabId = null;
  actions.renderFn();
}

const PANE_POLL_INTERVAL_MS = 3000;

async function pollPaneStates(state: TabState, render: () => void): Promise<void> {
  try {
    const paneStates = await listPanes();
    const stateMap = new Map(paneStates.map((p) => [p.id, p]));
    let changed = false;

    for (const tab of state.tabs) {
      const ps = stateMap.get(tab.sessionId);
      if (!ps) continue;

      if (ps.title && ps.title !== tab.label) {
        tab.label = ps.title;
        changed = true;
      }
      if (ps.bell && !tab.bell && tab.id !== state.activeTabId) {
        tab.bell = true;
        changed = true;
      }
    }

    if (changed) render();
  } catch {
    // polling failure is non-fatal
  }
}

export function createTabManager(container: HTMLElement): TabManager {
  const state: TabState = { tabs: [], activeTabId: null, tabCounter: 0 };
  const dom = createTabDom(container, () => void addTab());
  const cbs: TabCallbacks = { onSwitch: (id) => switchToTab(id), onClose: (id) => closeTab(id) };
  const render = () => renderAllTabs(state, dom, cbs);

  setInterval(() => void pollPaneStates(state, render), PANE_POLL_INTERVAL_MS);

  function switchToTab(id: string) { switchTab(state, id); render(); }
  async function addTab() { switchToTab(await addNewTab(state, dom.terminalArea)); }
  async function restoreOrAddTab() {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      await addTab();
      return;
    }
    for (const session of sessions) {
      const id = restoreExistingTab(state, dom.terminalArea, session.sessionId);
      switchToTab(id);
    }
  }
  function closeTab(id: string) { removeTab(state, id, { switchFn: switchToTab, renderFn: render }); }
  const getActive = (): Tab | null => state.tabs.find((t) => t.id === state.activeTabId) ?? null;

  return {
    addTab, restoreOrAddTab, closeTab, switchToTab,
    nextTab: () => { const id = cycleTab(state, 1); if (id) switchToTab(id); },
    prevTab: () => { const id = cycleTab(state, -1); if (id) switchToTab(id); },
    async splitVertical() { const t = getActive(); if (t) await t.paneManager.splitVertical(); },
    async splitHorizontal() { const t = getActive(); if (t) await t.paneManager.splitHorizontal(); },
    navigate(direction) { getActive()?.paneManager.navigate(direction); },
  };
}
