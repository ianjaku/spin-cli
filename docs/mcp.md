# MCP Server Integration

Spin includes a built-in MCP (Model Context Protocol) server that allows AI assistants like Cursor and Claude to interact with your services.

## Overview

The `spin mcp` command starts an MCP server using stdio transport. AI assistants spawn this command and communicate via stdin/stdout.

**Key feature**: The MCP server works even when the spin TUI isn't running. It reads the config to show available services and offers a `start_spin` tool. When spin TUI is running, it provides live status and logs via IPC.

## Automatic Setup

When you run `spin init`, spin automatically detects if you have Cursor or Claude Desktop installed and configures the MCP integration for you.

Supported targets:
- **Cursor (global)**: `~/.cursor/mcp.json`
- **Cursor (project)**: `.cursor/mcp.json`
- **Claude Desktop**: Platform-specific config file

## Manual Configuration

If auto-detection doesn't work, you can manually add spin to your MCP configuration.

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "spin": {
      "command": "spin",
      "args": ["mcp"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "spin": {
      "command": "spin",
      "args": ["mcp"]
    }
  }
}
```

## Available Tools

### When spin TUI is NOT running

#### list_services

List all configured services (from spin.config.ts).

**Returns:**
```json
{
  "spinRunning": false,
  "services": [
    {
      "id": "api",
      "name": "API Server",
      "status": "stopped",
      "description": "Backend API"
    }
  ]
}
```

#### get_service_status

Get status of a specific service.

**Parameters:**
- `service` (required): The service ID

#### start_spin

Returns the command to start spin.

**Parameters:**
- `group` (optional): Group name to start (e.g., "dev")

**Returns:**
```json
{
  "message": "Run the following command to start spin:",
  "command": "spin dev",
  "cwd": "/path/to/project",
  "hint": "The spin TUI will start and manage your services. Once running, more tools will be available."
}
```

### When spin TUI IS running

All the above tools plus:

#### get_logs

Get recent logs from a service.

**Parameters:**
- `service` (required): The service ID
- `lines` (optional): Number of lines to return (default: 50)

**Returns:**
```json
{
  "logs": [
    { "line": "Server started on port 3000", "stream": "stdout" }
  ]
}
```

## How It Works

```
┌─────────────────┐                    ┌──────────────────┐
│  AI Assistant   │ ◄──── stdio ────► │    spin mcp      │
│ (Cursor/Claude) │                    │   (spawned)      │
└─────────────────┘                    └────────┬─────────┘
                                                │
                                     ┌──────────┴──────────┐
                                     │                     │
                               Read config          Read state file
                               (always works)       (if TUI running)
                                     │                     │
                                     ▼                     ▼
                             spin.config.ts      ~/.spin/state/<hash>.json
                                                         │
                                                         │ Written by
                                                         ▼
                                                ┌─────────────────┐
                                                │    spin TUI     │
                                                │  (if running)   │
                                                └─────────────────┘
```

1. AI assistant spawns `spin mcp` as a subprocess
2. `spin mcp` always reads `spin.config.ts` to know what services exist
3. If spin TUI is running, it reads live state from `~/.spin/state/<hash>.json`
4. Tools adapt based on whether TUI is running

## State File Location

When spin TUI runs, it writes state to:
```
~/.spin/state/<project-hash>.json
```

This file contains:
- Process ID of the running spin TUI
- Current status of each service
- Recent log lines (last 100 per service)

The state file is automatically cleaned up when spin exits.

## Troubleshooting

### MCP not available

1. Make sure spin is installed globally (`npm install -g spin-cli`)
2. Check that `spin mcp` works from your terminal
3. Verify your MCP config file is valid JSON
4. Restart your AI assistant after configuration changes

### "spin.config.ts not found"

The MCP server looks for `spin.config.ts` in the current directory and parent directories. Make sure you're in a project with spin initialized (`spin init`).

### Stale state

If the spin TUI crashed without cleaning up, you might see stale state. The MCP server automatically detects dead processes and cleans up stale state files.
