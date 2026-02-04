<template>
  <div ref="terminalRoot" class="terminal-root"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import "@xterm/xterm/css/xterm.css";
import { createTabManager } from "../tabs.js";
import type { TabManager } from "../tabs.js";

const terminalRoot = ref<HTMLElement | null>(null);
let tabManager: TabManager | null = null;

function handleKeydown(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || !tabManager) return;

  const arrowToDirection: Record<string, "up" | "down" | "left" | "right"> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };

  const keyHandlers: Record<string, (e: KeyboardEvent, mgr: TabManager) => void> = {
    t: (ev) => { ev.preventDefault(); void tabManager!.addTab(); },
    w: (ev) => {
      ev.preventDefault();
      const active = document.querySelector(".tab.active .tab-close") as HTMLButtonElement | null;
      active?.click();
    },
    Tab: (ev) => {
      ev.preventDefault();
      if (ev.shiftKey) tabManager!.prevTab();
      else tabManager!.nextTab();
    },
    d: (ev) => {
      ev.preventDefault();
      if (ev.shiftKey) void tabManager!.splitHorizontal();
      else void tabManager!.splitVertical();
    },
  };

  const handler = keyHandlers[e.key];
  if (handler) {
    handler(e, tabManager);
    return;
  }

  const dir = arrowToDirection[e.key];
  if (e.shiftKey && dir) {
    e.preventDefault();
    tabManager.navigate(dir);
  }
}

onMounted(() => {
  if (!terminalRoot.value) return;
  tabManager = createTabManager(terminalRoot.value);
  void tabManager.restoreOrAddTab();
  document.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
});
</script>

<style scoped>
.terminal-root {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
