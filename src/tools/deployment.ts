import { EcpClient } from "../clients/ecp.js";
import { InstallerClient } from "../clients/installer.js";
import { ConsoleClient } from "../clients/console.js";
import { Config, sleep } from "../types.js";

export function getDeploymentTools() {
  return [
    {
      name: "check_simulator",
      description:
        "Verify the brs-desktop simulator is running and its services are accessible. " +
        "Checks ECP (port 8060), Web Installer (port 80), and Debug Console (port 8085). " +
        "Call this before using any other tools.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "install_channel",
      description:
        "Side-load a BrightScript channel package (.zip or .bpk) to the simulator. " +
        "Provide the absolute path to the package file. Returns installation status and optionally a screenshot.",
      inputSchema: {
        type: "object" as const,
        properties: {
          package_path: { type: "string", description: "Absolute path to the .zip or .bpk file to install" },
          screenshot_after: { type: "boolean", description: "Capture screenshot after installation (default: true)" },
          screenshot_delay_ms: { type: "number", description: "Delay before screenshot in ms (default: 2000)" },
        },
        required: ["package_path"],
      },
    },
    {
      name: "launch_app",
      description:
        "Launch an installed app by its ID. Use app_list to find available app IDs. " +
        "Optionally capture a screenshot after the app starts.",
      inputSchema: {
        type: "object" as const,
        properties: {
          app_id: { type: "string", description: "The application ID to launch" },
          params: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Optional launch parameters as key-value pairs",
          },
          screenshot_after: { type: "boolean", description: "Capture screenshot after launch (default: true)" },
          screenshot_delay_ms: { type: "number", description: "Delay before screenshot in ms (default: 2000)" },
        },
        required: ["app_id"],
      },
    },
  ];
}

export async function handleCheckSimulator(
  ecp: EcpClient,
  installer: InstallerClient,
  console_: ConsoleClient
) {
  const results: string[] = [];

  const ecpOk = await ecp.checkHealth();
  results.push(`ECP (port 8060): ${ecpOk ? "UP" : "DOWN - Make sure brs-desktop is running with the --ecp flag"}`);

  const webOk = await installer.checkHealth();
  results.push(`Web Installer (port 80): ${webOk ? "UP" : "DOWN - Make sure brs-desktop is running with the --web flag"}`);

  const consoleOk = await console_.checkHealth();
  results.push(`Debug Console (port 8085): ${consoleOk ? "UP" : "DOWN - Make sure brs-desktop is running with the --console flag"}`);

  return [{ type: "text" as const, text: results.join("\n") }];
}

export async function handleInstallChannel(
  args: { package_path: string; screenshot_after?: boolean; screenshot_delay_ms?: number },
  installer: InstallerClient,
  config: Config
) {
  const result = await installer.installPackage(args.package_path);

  const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
    { type: "text", text: result },
  ];

  const screenshotAfter = args.screenshot_after !== false; // default true
  if (screenshotAfter) {
    const delay = args.screenshot_delay_ms ?? 2000;
    await sleep(delay);
    const buf = await installer.captureScreenshot();
    content.push({ type: "image", data: buf.toString("base64"), mimeType: "image/png" });
  }

  return content;
}

export async function handleLaunchApp(
  args: { app_id: string; params?: Record<string, string>; screenshot_after?: boolean; screenshot_delay_ms?: number },
  ecp: EcpClient,
  installer: InstallerClient,
  config: Config
) {
  await ecp.launchApp(args.app_id, args.params);

  const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
    { type: "text", text: `Launched app ${args.app_id}` },
  ];

  const screenshotAfter = args.screenshot_after !== false; // default true
  if (screenshotAfter) {
    const delay = args.screenshot_delay_ms ?? 2000;
    await sleep(delay);
    const buf = await installer.captureScreenshot();
    content.push({ type: "image", data: buf.toString("base64"), mimeType: "image/png" });
  }

  return content;
}
