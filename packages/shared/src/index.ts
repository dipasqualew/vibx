export interface Entity {
  id: string;
  name: string;
}

export type {
  PtySize,
  PtySpawnOptions,
  PtySession,
  PtySessionEvents,
  PtyManager,
} from "./pty.js";

export type {
  WsClientInput,
  WsClientResize,
  WsClientMessage,
  WsServerOutput,
  WsServerSessionInfo,
  WsServerError,
  WsServerExit,
  WsServerMessage,
} from "./ws.js";

export { isWsClientMessage } from "./ws.js";

export type { UserSettings } from "./settings.js";
export { DEFAULT_USER_SETTINGS } from "./settings.js";
