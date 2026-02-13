# BRS-Desktop Simulator MCP Server

## Overview

Build an MCP (Model Context Protocol) server in TypeScript that enables Claude Code to interact with the brs-desktop Roku simulator. The server acts as a bridge between Claude Code and the simulator's existing REST APIs (ECP on port 8060, Web Installer on port 80, and Telnet Debug Console on port 8085).

This enables a visual development feedback loop: Claude can make code changes to BrightScript/SceneGraph source, deploy to the simulator, navigate the UI via remote control commands, capture screenshots to verify rendering, and read console output for debugging — all without human intervention.

## Technical Context

### brs-desktop Simulator Services

The brs-desktop simulator exposes three network services when launched with the appropriate flags:

1. **ECP (External Control Protocol)** — Port 8060 (enabled with `--ecp` flag)
   - RESTful API for remote control and device queries
   - Same protocol real Roku devices use
   - Supports keypress, app launch, device info queries

2. **Web Installer** — Port 80 (enabled with `--web` flag)
   - HTTP service for side-loading apps (zip/bpk files)
   - Provides screenshot capture of the running app
   - Requires basic auth (configurable password)

3. **Telnet Debug Console** — Port 8085 (enabled with `--console` flag)
   - BrightScript Micro Debugger access
   - Captures `print` statement output
   - Interactive debugging with breakpoints

### ECP Key Names

The following key names are supported by ECP keypress commands:
`Home`, `Rev`, `Fwd`, `Play`, `Select`, `Left`, `Right`, `Down`, `Up`, `Back`, `InstantReplay`, `Info`, `Backspace`, `Search`, `Enter`, `VolumeUp`, `VolumeDown`, `VolumeMute`

For text input on keyboard screens, use the `Lit_` prefix followed by the character (e.g., `Lit_a`, `Lit_B`, `Lit_1`). UTF-8 characters should be URL-encoded.

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK
- `node-fetch` or native fetch — HTTP requests to simulator APIs  
- `net` — Node.js built-in for telnet console connection
- `form-data` — For multipart form uploads (channel installation)
- `sharp` or raw buffer handling — For screenshot image processing (optional, only if resizing is needed)

## Project Structure

```
brs-desktop-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point, MCP server setup
│   ├── server.ts             # Tool definitions and handlers
│   ├── clients/
│   │   ├── ecp.ts            # ECP API client (port 8060)
│   │   ├── installer.ts      # Web Installer client (port 80)
│   │   └── console.ts        # Telnet debug console client (port 8085)
│   ├── tools/
│   │   ├── navigation.ts     # keypress, keypress_sequence, type_text
│   │   ├── visual.ts         # screenshot, screenshot_after_action
│   │   ├── deployment.ts     # install_channel, check_simulator
│   │   ├── query.ts          # device_info, active_app, app_list
│   │   └── debug.ts          # console_output, send_debug_command
│   └── types.ts              # Shared type definitions
└── README.md
```

## Configuration

The server should accept configuration via environment variables with sensible defaults:

| Variable | Default | Description |
|---|---|---|
| `BRS_HOST` | `127.0.0.1` | Simulator host address |
| `BRS_ECP_PORT` | `8060` | ECP service port |
| `BRS_WEB_PORT` | `80` | Web Installer port |
| `BRS_CONSOLE_PORT` | `8085` | Telnet debug console port |
| `BRS_WEB_PASSWORD` | `rokudev` | Web Installer auth password (username is always `rokudev`) |
| `BRS_SCREENSHOT_DELAY_MS` | `500` | Default delay before screenshot after actions |
| `BRS_KEYPRESS_DELAY_MS` | `300` | Default delay between keypresses in sequences |

## Tool Definitions

### 1. `check_simulator`

Verifies the simulator is running and services are accessible. **This should be called before any other tools.**

**Parameters:** None

**Behavior:**
- Attempt GET `http://{host}:{ecp_port}/` to check ECP
- Attempt GET `http://{host}:{web_port}/` to check Web Installer
- Attempt TCP connection to `{host}:{console_port}` to check debug console
- Return status of each service (up/down) and any error messages

**Returns:** Text content with status of each service.

---

### 2. `screenshot`

Captures a screenshot of the simulator's current display.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| `delay_ms` | number | No | Milliseconds to wait before capturing (default: 0) |

**Behavior:**
- If `delay_ms` > 0, wait that duration first
- POST to `http://rokudev:{password}@{host}:{web_port}/plugin_inspect` to request screenshot (or GET the screenshot URL — check which endpoint brs-desktop uses; on real Roku devices this is typically a POST to `/plugin_inspect` or a GET to `/pkgs/dev/screenshot.png`)
- If the above endpoint doesn't work, try: `http://{host}:{web_port}/plugin_inspect?screenshot` 
- Return the image as base64-encoded PNG in an image content block

**Returns:** Image content block with the screenshot.

**Implementation Note:** The exact screenshot endpoint may vary. Check the brs-desktop Web Installer source code. The standard Roku Web Installer uses a form POST to `/plugin_inspect` with a `screenshot` action, or exposes the last screenshot at a static path. Try multiple approaches and use whichever works. If none of the HTTP approaches work, fall back to using the ECP endpoint — some simulator versions support `GET /query/media-player` with screenshot data.

---

### 3. `keypress`

Sends a single remote control key event to the simulator.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Key name (e.g., "Select", "Down", "Home") or literal with "Lit_" prefix |
| `action` | string | No | One of "press", "down", "up" (default: "press") |
| `screenshot_after` | boolean | No | Capture and return screenshot after keypress (default: false) |
| `screenshot_delay_ms` | number | No | Delay before post-action screenshot (default: env `BRS_SCREENSHOT_DELAY_MS`) |

**Behavior:**
- Based on `action`:
  - "press": POST to `http://{host}:{ecp_port}/keypress/{key}`
  - "down": POST to `http://{host}:{ecp_port}/keydown/{key}`
  - "up": POST to `http://{host}:{ecp_port}/keyup/{key}`
- POST body is empty
- If `screenshot_after` is true, wait `screenshot_delay_ms` then capture and return screenshot

**Returns:** Text confirmation, optionally followed by image content block.

---

### 4. `keypress_sequence`

Sends multiple key events in order with configurable delays.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| `keys` | string[] | Yes | Array of key names to press in order |
| `delay_between_ms` | number | No | Delay between each keypress (default: env `BRS_KEYPRESS_DELAY_MS`) |
| `screenshot_after` | boolean | No | Capture screenshot after the full sequence (default: true) |
| `screenshot_delay_ms` | number | No | Delay before final screenshot (default: env `BRS_SCREENSHOT_DELAY_MS`) |

**Behavior:**
- Iterate through `keys` array, sending POST to `/keypress/{key}` for each
- Wait `delay_between_ms` between each keypress
- After all keys sent, optionally capture screenshot

**Example Usage:**
Navigate down 3 items and select:
```json
{ "keys": ["Down", "Down", "Down", "Select"], "delay_between_ms": 300 }
```

**Returns:** Text summary of keys pressed, optionally followed by image content block.

---

### 5. `type_text`

Types a string of text character by character, for use on keyboard/text input screens.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| `text` | string | Yes | Text to type |
| `delay_between_ms` | number | No | Delay between characters (default: 100) |
| `submit` | boolean | No | Send Enter key after typing (default: false) |
| `screenshot_after` | boolean | No | Capture screenshot after typing (default: false) |

**Behavior:**
- For each character in `text`, POST to `/keypress/Lit_{urlencoded_char}`
- Wait `delay_between_ms` between each character
- If `submit` is true, send `/keypress/Enter` after all characters
- Optionally capture screenshot

**Returns:** Text confirmation, optionally followed by image content block.

---

### 6. `device_info`

Queries the simulator's device configuration.

**Parameters:** None

**Behavior:**
- GET `http://{host}:{ecp_port}/query/device-info`
- Parse the XML response into a readable summary

**Returns:** Text content with device info (model, resolution, firmware version, language, country, etc.)

---

### 7. `active_app`

Queries what app is currently running on the simulator.

**Parameters:** None

**Behavior:**
- GET `http://{host}:{ecp_port}/query/active-app`
- Parse the XML response

**Returns:** Text content with the active app name and ID.

---

### 8. `app_list`

Lists all installed/available apps on the simulator.

**Parameters:** None

**Behavior:**
- GET `http://{host}:{ecp_port}/query/apps`
- Parse the XML response

**Returns:** Text content with list of apps (name, ID, version).

---

### 9. `install_channel`

Side-loads a BrightScript channel package to the simulator.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| `package_path` | string | Yes | Absolute path to the .zip or .bpk file to install |
| `screenshot_after` | boolean | No | Capture screenshot after installation (default: true) |
| `screenshot_delay_ms` | number | No | Delay before screenshot to allow app to initialize (default: 2000) |

**Behavior:**
- Read the file from `package_path`
- POST multipart form data to `http://rokudev:{password}@{host}:{web_port}/plugin_install` with:
  - `mysubmit` = "Install"
  - `archive` = the zip/bpk file
- Wait for response confirming installation
- If `screenshot_after`, wait `screenshot_delay_ms` (longer default here since the app needs to boot) then capture screenshot

**Returns:** Text confirmation of install success/failure, optionally followed by image content block of the running app.

---

### 10. `console_output`

Reads recent output from the BrightScript debug console.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| `lines` | number | No | Number of recent lines to return (default: 50) |
| `wait_ms` | number | No | Time to wait and collect output before returning (default: 500) |

**Behavior:**
- Connect to telnet at `{host}:{console_port}` (if not already connected)
- Maintain a rolling buffer of console output
- Return the last `lines` lines from the buffer
- The telnet connection should be kept alive across calls for the session

**Implementation Note:** The telnet connection should be managed as a persistent connection within the MCP server. Open it on first use, keep it alive, buffer incoming data, and reconnect if it drops. Use Node.js `net.Socket` for this — no telnet negotiation protocol is needed, it's a raw TCP text stream.

**Returns:** Text content with the console output.

---

### 11. `send_debug_command`

Sends a command to the BrightScript Micro Debugger.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| `command` | string | Yes | Debug command to send (e.g., "bt", "var", "cont", "step", "over") |
| `wait_ms` | number | No | Time to wait for response (default: 1000) |

**Behavior:**
- Send the command string followed by newline to the telnet console
- Wait `wait_ms` for response data
- Return the response

**Supported debugger commands to document:**
- `bt` — Print backtrace of call function context frames
- `var` — Print local variables and their types/values
- `cont` — Continue execution
- `step` — Step one program statement
- `over` — Step over one program statement
- `out` — Step out of the current function
- `last` — Print the last line that was executed
- `list` — List the current source code
- `exit` — Exit the debugger / terminate the app

**Returns:** Text content with the debugger response.

---

### 12. `launch_app`

Launches an installed app by ID.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| `app_id` | string | Yes | The application ID to launch |
| `params` | object | No | Optional launch parameters as key-value pairs |
| `screenshot_after` | boolean | No | Capture screenshot after launch (default: true) |
| `screenshot_delay_ms` | number | No | Delay before screenshot (default: 2000) |

**Behavior:**
- POST to `http://{host}:{ecp_port}/launch/{app_id}` with optional query parameters
- Optionally capture screenshot after delay

**Returns:** Text confirmation, optionally followed by image content block.

## Implementation Guidelines

### Error Handling

- Every tool should gracefully handle connection refused errors with a clear message suggesting the simulator isn't running or the relevant service isn't enabled
- Include the flag needed to enable the service in the error message (e.g., "ECP service not responding. Make sure brs-desktop is running with the --ecp flag")
- HTTP errors should return the status code and any body text
- Timeout all HTTP requests after 10 seconds
- Timeout telnet operations after the specified `wait_ms` plus a 2-second buffer

### Screenshot Implementation Details

- Screenshots should be returned as MCP image content blocks with `type: "image"` and `data` as base64-encoded PNG
- If the screenshot endpoint returns JPEG, that's fine too — just set the correct `mimeType`
- Keep screenshot file size reasonable; if images are very large, consider resizing to max 1280px wide using sharp (but only add this dependency if needed)

### Telnet Console Management

- Use a singleton pattern for the telnet connection
- Buffer all incoming data with timestamps
- Implement auto-reconnect with a 3-second delay on disconnect
- Strip ANSI escape codes from console output before returning
- Cap the rolling buffer at 1000 lines to prevent memory issues

### MCP Server Setup

- Use stdio transport (standard for Claude Code MCP servers)
- Register all tools with clear descriptions that help Claude understand when to use each one
- Tool descriptions should include example use cases

### Claude Code Integration

The user will register this MCP server in their Claude Code configuration. The typical setup in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "brs-desktop": {
      "command": "node",
      "args": ["/path/to/brs-desktop-mcp/dist/index.js"],
      "env": {
        "BRS_HOST": "127.0.0.1",
        "BRS_WEB_PASSWORD": "rokudev"
      }
    }
  }
}
```

## Build and Run

- Use `tsc` for compilation with `tsconfig.json` targeting ES2020+ and Node16 module resolution
- Add a `build` script in package.json: `tsc`
- Add a `dev` script for development: `tsc --watch`
- The compiled output should go to `dist/`
- Entry point: `dist/index.js`

## Testing Approach

Include a simple manual test script (`test/manual-test.ts`) that:

1. Calls `check_simulator` to verify services
2. Calls `device_info` to confirm communication
3. Calls `screenshot` to verify image capture works
4. Sends a `keypress` (Home) to verify ECP control
5. Captures another screenshot to verify the display changed

This doesn't need to be a full test suite — just a quick sanity check script that can be run with `npx ts-node test/manual-test.ts` to verify the server is working against a running simulator.

## Constraints

- Do not add unnecessary dependencies — keep the server lightweight
- Do not use any frameworks beyond the MCP SDK
- All HTTP requests should use native fetch (Node 18+) or `node-fetch` if targeting older Node versions
- Do not bundle or minify — this is a development tool, keep it debuggable
- The server should start up in under 2 seconds
- Do not implement any caching of screenshots — always capture fresh
