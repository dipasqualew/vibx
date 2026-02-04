import type { Entity } from "@vibx2/shared";

export function createEntity(id: string, name: string): Entity {
  return { id, name };
}

export {
  createPtyManager,
  bunPtyFactory,
  generateSessionId,
} from "./pty/index.js";

export type {
  PtyManagerDeps,
  PtyProcess,
  PtyFactory,
  PtyFactoryOptions,
  IDisposable,
  InternalPtySession,
} from "./pty/index.js";

export {
  createConnectionRegistry,
  createWsBridge,
  createWsServer,
} from "./ws/index.js";

export type {
  WsBridgeDeps,
  WsBridge,
  WsServerConfig,
  WsConnection,
  WsConnectionData,
  ConnectionRegistry,
} from "./ws/index.js";

export { createSettingsStore } from "./settings/index.js";
export type { SettingsStore, SettingsStoreDeps } from "./settings/index.js";

export { createActionsStore } from "./actions/index.js";
export type { ActionsStore, ActionsStoreDeps } from "./actions/index.js";
