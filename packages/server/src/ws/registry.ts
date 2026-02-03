import type { ConnectionRegistry, WsConnection } from "./types.js";

const EMPTY_SET: ReadonlySet<WsConnection> = new Set();

export function createConnectionRegistry(): ConnectionRegistry {
  const connections = new Map<string, Set<WsConnection>>();

  return {
    add(sessionId, ws) {
      let set = connections.get(sessionId);
      if (!set) {
        set = new Set();
        connections.set(sessionId, set);
      }
      set.add(ws);
    },

    remove(sessionId, ws) {
      const set = connections.get(sessionId);
      if (!set) return;
      set.delete(ws);
      if (set.size === 0) {
        connections.delete(sessionId);
      }
    },

    broadcast(sessionId, message) {
      const set = connections.get(sessionId);
      if (!set) return;
      set.forEach((ws) => ws.send(message));
    },

    getConnections(sessionId) {
      return connections.get(sessionId) ?? EMPTY_SET;
    },

    hasConnections(sessionId) {
      const set = connections.get(sessionId);
      return set !== undefined && set.size > 0;
    },
  };
}
