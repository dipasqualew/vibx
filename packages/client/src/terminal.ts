import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";

export interface TerminalConnection {
  readonly sessionId: string;
  readonly terminal: Terminal;
  readonly element: HTMLDivElement;
  onExit: (() => void) | null;
  dispose: () => void;
}

interface ServerMessage {
  type: string;
  data?: string;
  message?: string;
  code?: number;
}

function createTerminal(): Terminal {
  return new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "\"Cascadia Code\", Menlo, Monaco, \"Courier New\", monospace",
    theme: {
      background: "#1e1e1e",
      foreground: "#d4d4d4",
    },
  });
}

function mountTerminal(terminal: Terminal): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "terminal-container";
  terminal.open(element);
  (element as unknown as Record<string, unknown>)["__terminal"] = terminal;
  return element;
}

function tryLoadWebgl(terminal: Terminal): void {
  try {
    const webglAddon = new WebglAddon();
    terminal.loadAddon(webglAddon);
    webglAddon.onContextLoss(() => webglAddon.dispose());
  } catch {
    // WebGL not available, fall back to canvas renderer
  }
}

type MessageHandler = (msg: ServerMessage, terminal: Terminal, connection: TerminalConnection) => void;

const messageHandlers: Record<string, MessageHandler> = {
  output(msg, terminal) { if (msg.data) terminal.write(msg.data); },
  exit(msg, terminal, connection) {
    terminal.write(`\r\n[Process exited with code ${msg.code ?? 0}]\r\n`);
    connection.onExit?.();
  },
  error(msg, terminal) {
    terminal.write(`\r\n[Error: ${msg.message ?? "unknown"}]\r\n`);
  },
};

function handleServerMessage(msg: ServerMessage, terminal: Terminal, connection: TerminalConnection): void {
  messageHandlers[msg.type]?.(msg, terminal, connection);
}

export function createTerminalConnection(sessionId: string): TerminalConnection {
  const terminal = createTerminal();
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const element = mountTerminal(terminal);
  tryLoadWebgl(terminal);
  fitAddon.fit();

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws/pty/${sessionId}`);

  const connection: TerminalConnection = { sessionId, terminal, element, onExit: null, dispose };

  ws.addEventListener("message", (event: MessageEvent) => {
    handleServerMessage(JSON.parse(event.data as string) as ServerMessage, terminal, connection);
  });

  ws.addEventListener("open", () => {
    terminal.onData((data) => ws.send(JSON.stringify({ type: "input", data })));
    sendResize();
  });

  function sendResize() {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
    }
  }

  const resizeObserver = new ResizeObserver(() => { fitAddon.fit(); sendResize(); });
  resizeObserver.observe(element);

  function dispose() { resizeObserver.disconnect(); ws.close(); terminal.dispose(); element.remove(); }

  return connection;
}
