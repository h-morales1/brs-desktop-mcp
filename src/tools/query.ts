import { EcpClient } from "../clients/ecp.js";

export function getQueryTools() {
  return [
    {
      name: "device_info",
      description:
        "Query the simulator's device configuration including model, resolution, firmware version, language, and country.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "active_app",
      description: "Query what app is currently running on the simulator. Returns the app name and ID.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "app_list",
      description: "List all installed/available apps on the simulator with their names, IDs, and versions.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ];
}

function parseXmlElements(xml: string): string {
  // Extract element tags and their text content from simple XML
  const lines: string[] = [];
  const tagRegex = /<([a-zA-Z-_]+)([^>]*)>([^<]*)<\/\1>/g;
  let match;
  while ((match = tagRegex.exec(xml)) !== null) {
    const tag = match[1];
    const value = match[3].trim();
    if (value) {
      lines.push(`${tag}: ${value}`);
    }
  }
  return lines.join("\n");
}

function parseAppsXml(xml: string): string {
  const lines: string[] = [];
  const appRegex = /<app\s+([^>]*)>([^<]*)<\/app>/g;
  let match;
  while ((match = appRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const name = match[2].trim();
    const idMatch = attrs.match(/id="([^"]*)"/);
    const versionMatch = attrs.match(/version="([^"]*)"/);
    const id = idMatch?.[1] ?? "?";
    const version = versionMatch?.[1] ?? "?";
    lines.push(`[${id}] ${name} (v${version})`);
  }
  return lines.length > 0 ? lines.join("\n") : "No apps found";
}

function parseActiveAppXml(xml: string): string {
  const appRegex = /<app\s+([^>]*)>([^<]*)<\/app>/;
  const match = appRegex.exec(xml);
  if (!match) return "No active app";
  const attrs = match[1];
  const name = match[2].trim();
  const idMatch = attrs.match(/id="([^"]*)"/);
  const id = idMatch?.[1] ?? "?";
  return `Active app: ${name} (ID: ${id})`;
}

export async function handleDeviceInfo(ecp: EcpClient) {
  const xml = await ecp.queryDeviceInfo();
  const parsed = parseXmlElements(xml);
  return [{ type: "text" as const, text: parsed || xml }];
}

export async function handleActiveApp(ecp: EcpClient) {
  const xml = await ecp.queryActiveApp();
  const parsed = parseActiveAppXml(xml);
  return [{ type: "text" as const, text: parsed }];
}

export async function handleAppList(ecp: EcpClient) {
  const xml = await ecp.queryApps();
  const parsed = parseAppsXml(xml);
  return [{ type: "text" as const, text: parsed }];
}
