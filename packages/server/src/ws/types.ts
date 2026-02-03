export interface WsConnection {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}

export interface WsConnectionData {
  sessionId: string;
}

export interface ConnectionRegistry {
  add: (sessionId: string, ws: WsConnection) => void;
  remove: (sessionId: string, ws: WsConnection) => void;
  broadcast: (sessionId: string, message: string) => void;
  getConnections: (sessionId: string) => ReadonlySet<WsConnection>;
  hasConnections: (sessionId: string) => boolean;
}
