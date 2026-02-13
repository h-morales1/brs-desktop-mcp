export interface Config {
  host: string;
  ecpPort: number;
  webPort: number;
  consolePort: number;
  webPassword: string;
  screenshotDelayMs: number;
  keypressDelayMs: number;
}

export function getConfig(): Config {
  return {
    host: process.env.BRS_HOST || "127.0.0.1",
    ecpPort: parseInt(process.env.BRS_ECP_PORT || "8060", 10),
    webPort: parseInt(process.env.BRS_WEB_PORT || "8888", 10),
    consolePort: parseInt(process.env.BRS_CONSOLE_PORT || "8085", 10),
    webPassword: process.env.BRS_WEB_PASSWORD || "rokudev",
    screenshotDelayMs: parseInt(process.env.BRS_SCREENSHOT_DELAY_MS || "500", 10),
    keypressDelayMs: parseInt(process.env.BRS_KEYPRESS_DELAY_MS || "300", 10),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
