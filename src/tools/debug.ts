import { ConsoleClient } from "../clients/console.js";

export function getDebugTools() {
  return [
    {
      name: "console_output",
      description:
        "Read recent output from the BrightScript debug console. " +
        "Shows print statement output and debugger messages. " +
        "The console connection is kept alive across calls.",
      inputSchema: {
        type: "object" as const,
        properties: {
          lines: { type: "number", description: "Number of recent lines to return (default: 50)" },
          wait_ms: { type: "number", description: "Time to wait and collect output before returning in ms (default: 500)" },
        },
      },
    },
    {
      name: "send_debug_command",
      description:
        "Send a command to the BrightScript Micro Debugger. " +
        "Supported commands: bt (backtrace), var (local variables), cont (continue), " +
        "step (step one statement), over (step over), out (step out), " +
        "last (last executed line), list (current source), exit (terminate app).",
      inputSchema: {
        type: "object" as const,
        properties: {
          command: { type: "string", description: 'Debug command to send (e.g. "bt", "var", "cont")' },
          wait_ms: { type: "number", description: "Time to wait for response in ms (default: 1000)" },
        },
        required: ["command"],
      },
    },
  ];
}

export async function handleConsoleOutput(
  args: { lines?: number; wait_ms?: number },
  console_: ConsoleClient
) {
  await console_.ensureConnected();

  const waitMs = args.wait_ms ?? 500;
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const lines = console_.getRecentLines(args.lines ?? 50);
  const text = lines.length > 0 ? lines.join("\n") : "(no console output)";
  return [{ type: "text" as const, text }];
}

export async function handleSendDebugCommand(
  args: { command: string; wait_ms?: number },
  console_: ConsoleClient
) {
  const response = await console_.sendCommand(args.command, args.wait_ms ?? 1000);
  return [{ type: "text" as const, text: response || "(no response)" }];
}
