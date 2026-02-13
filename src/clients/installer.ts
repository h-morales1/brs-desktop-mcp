import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import FormData from "form-data";
import { Config } from "../types.js";

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop: string;
  opaque: string;
}

export class InstallerClient {
  private baseUrl: string;
  private username = "rokudev";
  private nc = 0;

  constructor(private config: Config) {
    this.baseUrl = `http://${config.host}:${config.webPort}`;
  }

  private md5(data: string): string {
    return createHash("md5").update(data).digest("hex");
  }

  private parseChallenge(header: string): DigestChallenge {
    const get = (key: string): string => {
      const match = header.match(new RegExp(`${key}="([^"]*)"`, "i"));
      return match?.[1] ?? "";
    };
    return {
      realm: get("realm"),
      nonce: get("nonce"),
      qop: get("qop") || "auth",
      opaque: get("opaque"),
    };
  }

  private buildAuthHeader(challenge: DigestChallenge, method: string, uri: string): string {
    this.nc++;
    const ncStr = this.nc.toString(16).padStart(8, "0");
    const cnonce = randomBytes(16).toString("hex");

    const ha1 = this.md5(`${this.username}:${challenge.realm}:${this.config.webPassword}`);
    const ha2 = this.md5(`${method}:${uri}`);
    const response = this.md5(`${ha1}:${challenge.nonce}:${ncStr}:${cnonce}:${challenge.qop}:${ha2}`);

    return [
      `Digest username="${this.username}"`,
      `realm="${challenge.realm}"`,
      `nonce="${challenge.nonce}"`,
      `uri="${uri}"`,
      `qop=${challenge.qop}`,
      `nc=${ncStr}`,
      `cnonce="${cnonce}"`,
      `response="${response}"`,
      `opaque="${challenge.opaque}"`,
    ].join(", ");
  }

  private async digestRequest(
    method: string,
    path: string,
    body?: Buffer | FormData,
    extraHeaders?: Record<string, string>
  ): Promise<{ status: number; text: string; buffer: Buffer }> {
    const url = `${this.baseUrl}${path}`;
    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), 10000);

    let challengeHeader: string;
    try {
      const res = await fetch(url, { method, signal: controller1.signal });
      if (res.status !== 401) {
        const buf = Buffer.from(await res.arrayBuffer());
        return { status: res.status, text: buf.toString("utf-8"), buffer: buf };
      }
      challengeHeader = res.headers.get("www-authenticate") || "";
    } finally {
      clearTimeout(timeout1);
    }

    if (!challengeHeader) {
      throw new Error("No WWW-Authenticate header in 401 response");
    }

    const challenge = this.parseChallenge(challengeHeader);
    const authHeader = this.buildAuthHeader(challenge, method, path);

    const headers: Record<string, string> = {
      Authorization: authHeader,
      ...extraHeaders,
    };

    let fetchBody: BodyInit | undefined;
    if (body instanceof FormData) {
      headers["Content-Type"] = `multipart/form-data; boundary=${body.getBoundary()}`;
      const buf = body.getBuffer();
      fetchBody = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as unknown as BodyInit;
    } else if (body) {
      fetchBody = new Uint8Array(body.buffer, body.byteOffset, body.byteLength) as unknown as BodyInit;
    }

    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 30000);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: fetchBody,
        signal: controller2.signal,
      });
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, text: buf.toString("utf-8"), buffer: buf };
    } finally {
      clearTimeout(timeout2);
    }
  }

  async captureScreenshot(): Promise<Buffer> {
    // Step 1: POST /plugin_inspect with digest auth to trigger screenshot save
    const form = new FormData();
    form.append("mysubmit", "Screenshot");
    await this.digestRequest("POST", "/plugin_inspect", form);

    // Step 2: Wait for simulator to write the screenshot to disk
    await new Promise((r) => setTimeout(r, this.config.screenshotDelayMs));

    // Step 3: GET the screenshot image (no auth needed)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      // Try PNG first, fall back to JPG
      let res = await fetch(`${this.baseUrl}/pkgs/dev.png`, { signal: controller.signal });
      if (!res.ok) {
        res = await fetch(`${this.baseUrl}/pkgs/dev.jpg`, { signal: controller.signal });
      }
      if (!res.ok) {
        throw new Error(`Screenshot retrieval failed with status ${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }

  async installPackage(filePath: string): Promise<string> {
    const fileBuffer = readFileSync(filePath);
    const fileName = basename(filePath);

    const form = new FormData();
    form.append("mysubmit", "Install");
    form.append("archive", fileBuffer, { filename: fileName, contentType: "application/octet-stream" });

    const { status, text } = await this.digestRequest("POST", "/plugin_install", form);
    if (status >= 200 && status < 300) {
      return `Channel installed successfully (${status})`;
    }
    return `Install responded with status ${status}: ${text.substring(0, 500)}`;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${this.baseUrl}/`, { signal: controller.signal });
        // 401 means the server is up (just needs auth)
        return res.status === 401 || res.ok;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return false;
    }
  }
}
