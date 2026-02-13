# brs-desktop-mcp

MCP (Model Context Protocol) server for the [brs-desktop](https://github.com/nicholashholmern/brs-desktop) Roku simulator. Lets you deploy channels, send remote control commands, capture screenshots, and read debug console output — all from Claude Code or any MCP-compatible client.

## Prerequisites

- **Node.js 18+**
- **brs-desktop** simulator running with the `--ecp`, `--web`, and `--console` flags:
  ```bash
  npm run start --ecp --web --console
  ```

## Install & Build

```bash
cd brs-desktop-mcp
npm install
npm run build
```

## Claude Code Setup

Add the server to your Claude Code MCP config (`.claude/settings.json` or project settings):

```json
{
  "mcpServers": {
    "brs-desktop": {
      "command": "node",
      "args": ["/absolute/path/to/brs-desktop-mcp/dist/index.js"]
    }
  }
}
```

## Configuration

All settings are optional environment variables with sensible defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `BRS_HOST` | `127.0.0.1` | Simulator host address |
| `BRS_ECP_PORT` | `8060` | ECP (External Control Protocol) port |
| `BRS_WEB_PORT` | `80` | Web installer port |
| `BRS_CONSOLE_PORT` | `8085` | BrightScript debug console port |
| `BRS_WEB_PASSWORD` | `rokudev` | Web installer password |
| `BRS_SCREENSHOT_DELAY_MS` | `500` | Default delay before post-action screenshots (ms) |
| `BRS_KEYPRESS_DELAY_MS` | `300` | Default delay between sequential keypresses (ms) |

Set them in your MCP config if needed:

```json
{
  "mcpServers": {
    "brs-desktop": {
      "command": "node",
      "args": ["/absolute/path/to/brs-desktop-mcp/dist/index.js"],
      "env": {
        "BRS_HOST": "192.168.1.100",
        "BRS_ECP_PORT": "8060"
      }
    }
  }
}
```

## Tools Reference

### Navigation

#### `keypress`
Send a single remote control key event.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | string | yes | Key name (e.g. `Select`, `Down`) or literal with `Lit_` prefix |
| `action` | string | no | `press` (default), `down`, or `up` |
| `screenshot_after` | boolean | no | Capture screenshot after keypress (default: false) |
| `screenshot_delay_ms` | number | no | Delay before screenshot |

#### `keypress_sequence`
Send multiple key events in order with delays between each.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keys` | string[] | yes | Array of key names to press in order |
| `delay_between_ms` | number | no | Delay between keypresses (default: from config) |
| `screenshot_after` | boolean | no | Capture screenshot after sequence (default: true) |
| `screenshot_delay_ms` | number | no | Delay before final screenshot |

#### `type_text`
Type a string character by character as `Lit_` keypresses.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | yes | Text to type |
| `delay_between_ms` | number | no | Delay between characters (default: 100ms) |
| `submit` | boolean | no | Press Enter after typing (default: false) |
| `screenshot_after` | boolean | no | Capture screenshot after typing (default: false) |

### Visual

#### `screenshot`
Capture a PNG screenshot of the simulator's current display.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `delay_ms` | number | no | Milliseconds to wait before capturing (default: 0) |

### Deployment

#### `check_simulator`
Verify the simulator is running and all services (ECP, Web Installer, Debug Console) are accessible. No parameters. Call this before using other tools.

#### `install_channel`
Side-load a `.zip` or `.bpk` channel package to the simulator.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `package_path` | string | yes | Absolute path to the package file |
| `screenshot_after` | boolean | no | Capture screenshot after install (default: true) |
| `screenshot_delay_ms` | number | no | Delay before screenshot (default: 2000ms) |

#### `launch_app`
Launch an installed app by its ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `app_id` | string | yes | Application ID (use `app_list` to find IDs) |
| `params` | object | no | Launch parameters as key-value pairs |
| `screenshot_after` | boolean | no | Capture screenshot after launch (default: true) |
| `screenshot_delay_ms` | number | no | Delay before screenshot (default: 2000ms) |

### Query

#### `device_info`
Query simulator device configuration (model, resolution, firmware, language, country). No parameters.

#### `active_app`
Get the currently running app's name and ID. No parameters.

#### `app_list`
List all installed apps with names, IDs, and versions. No parameters.

### Debug

#### `console_output`
Read recent output from the BrightScript debug console.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lines` | number | no | Number of recent lines to return (default: 50) |
| `wait_ms` | number | no | Time to collect output before returning (default: 500ms) |

#### `send_debug_command`
Send a command to the BrightScript Micro Debugger.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | yes | Debug command: `bt`, `var`, `cont`, `step`, `over`, `out`, `last`, `list`, `exit` |
| `wait_ms` | number | no | Time to wait for response (default: 1000ms) |

## Supported Keys

Standard remote control keys for `keypress` and `keypress_sequence`:

`Home`, `Rev`, `Fwd`, `Play`, `Select`, `Left`, `Right`, `Down`, `Up`, `Back`, `InstantReplay`, `Info`, `Backspace`, `Search`, `Enter`, `VolumeUp`, `VolumeDown`, `VolumeMute`

For literal characters, use the `Lit_` prefix: `Lit_a`, `Lit_1`, `Lit_%20` (URL-encoded space). The `type_text` tool handles this encoding automatically.

## Project Structure

```
src/
  index.ts              # Entry point — stdio transport
  server.ts             # MCP server setup and tool routing
  types.ts              # Config, env var loading, helpers
  clients/
    ecp.ts              # ECP (External Control Protocol) HTTP client
    installer.ts        # Web installer client (sideload + screenshots)
    console.ts          # Telnet debug console client
  tools/
    navigation.ts       # keypress, keypress_sequence, type_text
    visual.ts           # screenshot
    deployment.ts       # check_simulator, install_channel, launch_app
    query.ts            # device_info, active_app, app_list
    debug.ts            # console_output, send_debug_command
```
