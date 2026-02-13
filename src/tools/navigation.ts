import { EcpClient } from "../clients/ecp.js";
import { InstallerClient } from "../clients/installer.js";
import { Config, sleep } from "../types.js";

export function getNavigationTools() {
  return [
    {
      name: "keypress",
      description:
        "Send a single remote control key event to the Roku simulator. " +
        "Supported keys: Home, Rev, Fwd, Play, Select, Left, Right, Down, Up, Back, " +
        "InstantReplay, Info, Backspace, Search, Enter, VolumeUp, VolumeDown, VolumeMute. " +
        'For literal characters use the Lit_ prefix (e.g. "Lit_a", "Lit_1").',
      inputSchema: {
        type: "object" as const,
        properties: {
          key: { type: "string", description: 'Key name (e.g. "Select", "Down", "Home") or literal with "Lit_" prefix' },
          action: { type: "string", enum: ["press", "down", "up"], description: 'Key action (default: "press")' },
          screenshot_after: { type: "boolean", description: "Capture and return screenshot after keypress (default: false)" },
          screenshot_delay_ms: { type: "number", description: "Delay in ms before post-action screenshot" },
        },
        required: ["key"],
      },
    },
    {
      name: "keypress_sequence",
      description:
        "Send multiple remote control key events in order with delays between each. " +
        'Example: ["Down", "Down", "Down", "Select"] to navigate down 3 items and select.',
      inputSchema: {
        type: "object" as const,
        properties: {
          keys: { type: "array", items: { type: "string" }, description: "Array of key names to press in order" },
          delay_between_ms: { type: "number", description: "Delay between each keypress in ms (default: from config)" },
          screenshot_after: { type: "boolean", description: "Capture screenshot after the full sequence (default: true)" },
          screenshot_delay_ms: { type: "number", description: "Delay before final screenshot in ms" },
        },
        required: ["keys"],
      },
    },
    {
      name: "type_text",
      description:
        "Type a string of text character by character on a keyboard/text input screen. " +
        "Each character is sent as a Lit_ keypress. Optionally press Enter to submit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          text: { type: "string", description: "Text to type" },
          delay_between_ms: { type: "number", description: "Delay between characters in ms (default: 100)" },
          submit: { type: "boolean", description: "Send Enter key after typing (default: false)" },
          screenshot_after: { type: "boolean", description: "Capture screenshot after typing (default: false)" },
        },
        required: ["text"],
      },
    },
  ];
}

async function captureScreenshotContent(installer: InstallerClient) {
  const buf = await installer.captureScreenshot();
  return { type: "image" as const, data: buf.toString("base64"), mimeType: "image/png" };
}

export async function handleKeypress(
  args: { key: string; action?: string; screenshot_after?: boolean; screenshot_delay_ms?: number },
  ecp: EcpClient,
  installer: InstallerClient,
  config: Config
) {
  const action = (args.action || "press") as "press" | "down" | "up";
  await ecp.keypress(args.key, action);

  const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
    { type: "text", text: `Key ${action}: ${args.key}` },
  ];

  if (args.screenshot_after) {
    const delay = args.screenshot_delay_ms ?? config.screenshotDelayMs;
    await sleep(delay);
    content.push(await captureScreenshotContent(installer));
  }

  return content;
}

export async function handleKeypressSequence(
  args: { keys: string[]; delay_between_ms?: number; screenshot_after?: boolean; screenshot_delay_ms?: number },
  ecp: EcpClient,
  installer: InstallerClient,
  config: Config
) {
  const delay = args.delay_between_ms ?? config.keypressDelayMs;
  const screenshotAfter = args.screenshot_after !== false; // default true

  for (let i = 0; i < args.keys.length; i++) {
    await ecp.keypress(args.keys[i]);
    if (i < args.keys.length - 1) {
      await sleep(delay);
    }
  }

  const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
    { type: "text", text: `Pressed ${args.keys.length} keys: ${args.keys.join(", ")}` },
  ];

  if (screenshotAfter) {
    const screenshotDelay = args.screenshot_delay_ms ?? config.screenshotDelayMs;
    await sleep(screenshotDelay);
    content.push(await captureScreenshotContent(installer));
  }

  return content;
}

export async function handleTypeText(
  args: { text: string; delay_between_ms?: number; submit?: boolean; screenshot_after?: boolean },
  ecp: EcpClient,
  installer: InstallerClient,
  config: Config
) {
  const delay = args.delay_between_ms ?? 100;

  for (let i = 0; i < args.text.length; i++) {
    const char = args.text[i];
    const encoded = `Lit_${encodeURIComponent(char)}`;
    await ecp.keypress(encoded);
    if (i < args.text.length - 1) {
      await sleep(delay);
    }
  }

  if (args.submit) {
    await sleep(delay);
    await ecp.keypress("Enter");
  }

  const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
    { type: "text", text: `Typed "${args.text}"${args.submit ? " and pressed Enter" : ""}` },
  ];

  if (args.screenshot_after) {
    await sleep(config.screenshotDelayMs);
    content.push(await captureScreenshotContent(installer));
  }

  return content;
}
