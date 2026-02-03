export interface WsClientInput {
  type: "input";
  data: string;
}

export interface WsClientResize {
  type: "resize";
  cols: number;
  rows: number;
}

export type WsClientMessage = WsClientInput | WsClientResize;

export interface WsServerOutput {
  type: "output";
  data: string;
}

export interface WsServerSessionInfo {
  type: "session_info";
  sessionId: string;
  shell: string;
  pid: number;
}

export interface WsServerError {
  type: "error";
  message: string;
}

export interface WsServerExit {
  type: "exit";
  code: number;
  signal?: number | undefined;
}

export type WsServerMessage =
  | WsServerOutput
  | WsServerSessionInfo
  | WsServerError
  | WsServerExit;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInputMessage(msg: Record<string, unknown>): boolean {
  return msg["type"] === "input" && typeof msg["data"] === "string";
}

function isResizeMessage(msg: Record<string, unknown>): boolean {
  return (
    msg["type"] === "resize" &&
    typeof msg["cols"] === "number" &&
    typeof msg["rows"] === "number"
  );
}

export function isWsClientMessage(msg: unknown): msg is WsClientMessage {
  if (!isRecord(msg)) return false;
  return isInputMessage(msg) || isResizeMessage(msg);
}
