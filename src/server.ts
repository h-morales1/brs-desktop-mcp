import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getConfig } from "./types.js";
import { EcpClient } from "./clients/ecp.js";
import { InstallerClient } from "./clients/installer.js";
import { ConsoleClient } from "./clients/console.js";
import { getNavigationTools, handleKeypress, handleKeypressSequence, handleTypeText } from "./tools/navigation.js";
import { getVisualTools, handleScreenshot } from "./tools/visual.js";
import { getDeploymentTools, handleCheckSimulator, handleInstallChannel, handleLaunchApp } from "./tools/deployment.js";
import { getQueryTools, handleDeviceInfo, handleActiveApp, handleAppList } from "./tools/query.js";
import { getDebugTools, handleConsoleOutput, handleSendDebugCommand } from "./tools/debug.js";

export function createServer(): Server {
  const config = getConfig();
  const ecp = new EcpClient(config);
  const installer = new InstallerClient(config);
  const consoleClient = new ConsoleClient(config);

  const server = new Server(
    { name: "brs-desktop-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  const allTools = [
    ...getNavigationTools(),
    ...getVisualTools(),
    ...getDeploymentTools(),
    ...getQueryTools(),
    ...getDebugTools(),
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      let content;

      switch (name) {
        // Navigation
        case "keypress":
          content = await handleKeypress(args as any, ecp, installer, config);
          break;
        case "keypress_sequence":
          content = await handleKeypressSequence(args as any, ecp, installer, config);
          break;
        case "type_text":
          content = await handleTypeText(args as any, ecp, installer, config);
          break;

        // Visual
        case "screenshot":
          content = await handleScreenshot(args as any, installer);
          break;

        // Deployment
        case "check_simulator":
          content = await handleCheckSimulator(ecp, installer, consoleClient);
          break;
        case "install_channel":
          content = await handleInstallChannel(args as any, installer, config);
          break;
        case "launch_app":
          content = await handleLaunchApp(args as any, ecp, installer, config);
          break;

        // Query
        case "device_info":
          content = await handleDeviceInfo(ecp);
          break;
        case "active_app":
          content = await handleActiveApp(ecp);
          break;
        case "app_list":
          content = await handleAppList(ecp);
          break;

        // Debug
        case "console_output":
          content = await handleConsoleOutput(args as any, consoleClient);
          break;
        case "send_debug_command":
          content = await handleSendDebugCommand(args as any, consoleClient);
          break;

        default:
          return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }

      return { content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let hint = "";

      if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
        if (name.startsWith("key") || name === "type_text" || name === "device_info" || name === "active_app" || name === "app_list" || name === "launch_app") {
          hint = "\n\nMake sure brs-desktop is running with the --ecp flag.";
        } else if (name === "screenshot" || name === "install_channel") {
          hint = "\n\nMake sure brs-desktop is running with the --web flag.";
        } else if (name === "console_output" || name === "send_debug_command") {
          hint = "\n\nMake sure brs-desktop is running with the --console flag.";
        }
      }

      return { content: [{ type: "text", text: `Error: ${message}${hint}` }], isError: true };
    }
  });

  // Clean up console connection on server close
  process.on("SIGINT", () => {
    consoleClient.disconnect();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    consoleClient.disconnect();
    process.exit(0);
  });

  return server;
}
