import { InstallerClient } from "../clients/installer.js";
import { sleep } from "../types.js";

export function getVisualTools() {
  return [
    {
      name: "screenshot",
      description:
        "Capture a screenshot of the Roku simulator's current display. " +
        "Returns a PNG image. Use this to verify what's on screen after navigation or deployment.",
      inputSchema: {
        type: "object" as const,
        properties: {
          delay_ms: { type: "number", description: "Milliseconds to wait before capturing (default: 0)" },
        },
      },
    },
  ];
}

export async function handleScreenshot(
  args: { delay_ms?: number },
  installer: InstallerClient
) {
  if (args.delay_ms && args.delay_ms > 0) {
    await sleep(args.delay_ms);
  }

  const buf = await installer.captureScreenshot();
  return [{ type: "image" as const, data: buf.toString("base64"), mimeType: "image/png" }];
}
