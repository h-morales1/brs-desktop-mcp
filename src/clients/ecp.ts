import { Config } from "../types.js";

export class EcpClient {
  private baseUrl: string;

  constructor(private config: Config) {
    this.baseUrl = `http://${config.host}:${config.ecpPort}`;
  }

  private async request(method: string, path: string, body?: string): Promise<{ status: number; text: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        body,
        signal: controller.signal,
      });
      const text = await res.text();
      return { status: res.status, text };
    } finally {
      clearTimeout(timeout);
    }
  }

  async keypress(key: string, action: "press" | "down" | "up" = "press"): Promise<void> {
    const endpoint = action === "press" ? "keypress" : action === "down" ? "keydown" : "keyup";
    const { status } = await this.request("POST", `/${endpoint}/${encodeURIComponent(key)}`);
    if (status < 200 || status >= 300) {
      throw new Error(`Keypress failed with status ${status}`);
    }
  }

  async queryDeviceInfo(): Promise<string> {
    const { text } = await this.request("GET", "/query/device-info");
    return text;
  }

  async queryActiveApp(): Promise<string> {
    const { text } = await this.request("GET", "/query/active-app");
    return text;
  }

  async queryApps(): Promise<string> {
    const { text } = await this.request("GET", "/query/apps");
    return text;
  }

  async launchApp(appId: string, params?: Record<string, string>): Promise<void> {
    let path = `/launch/${encodeURIComponent(appId)}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) path += `?${qs}`;
    }
    const { status } = await this.request("POST", path);
    if (status < 200 || status >= 300) {
      throw new Error(`Launch failed with status ${status}`);
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.request("GET", "/");
      return true;
    } catch {
      return false;
    }
  }
}
