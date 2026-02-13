import { Socket } from "node:net";
import { Config } from "../types.js";

const MAX_BUFFER_LINES = 1000;
const RECONNECT_DELAY_MS = 3000;

// Strip ANSI escape codes
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

export class ConsoleClient {
  private socket: Socket | null = null;
  private buffer: string[] = [];
  private connected = false;
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private partialLine = "";

  constructor(private config: Config) {}

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;

    this.connecting = true;

    return new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        this.connecting = false;
        reject(new Error("Console connection timed out"));
      }, 10000);

      socket.connect(this.config.consolePort, this.config.host, () => {
        clearTimeout(timeout);
        this.socket = socket;
        this.connected = true;
        this.connecting = false;
        resolve();
      });

      socket.on("data", (data) => {
        const text = stripAnsi(data.toString("utf-8"));
        const lines = (this.partialLine + text).split("\n");
        // Last element is incomplete line (may be empty string)
        this.partialLine = lines.pop() ?? "";
        for (const line of lines) {
          this.buffer.push(line);
        }
        // Trim buffer to max size
        if (this.buffer.length > MAX_BUFFER_LINES) {
          this.buffer = this.buffer.slice(-MAX_BUFFER_LINES);
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timeout);
        if (this.connecting) {
          this.connecting = false;
          reject(err);
        }
      });

      socket.on("close", () => {
        this.connected = false;
        this.socket = null;
        this.scheduleReconnect();
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        // Will retry on next scheduleReconnect or explicit connect
      }
    }, RECONNECT_DELAY_MS);
  }

  async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  getRecentLines(n: number = 50): string[] {
    return this.buffer.slice(-n);
  }

  async sendCommand(command: string, waitMs: number = 1000): Promise<string> {
    await this.ensureConnected();
    if (!this.socket) throw new Error("Console not connected");

    const beforeLen = this.buffer.length;
    this.socket.write(`${command}\r\n`);

    // Wait for response
    await new Promise((r) => setTimeout(r, waitMs));

    const newLines = this.buffer.slice(beforeLen);
    return newLines.join("\n");
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.ensureConnected();
      return this.connected;
    } catch {
      return false;
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }
}
