# spin

A beautiful interactive TUI for managing multiple dev services. Start your entire development stack with a single command, view logs in real-time, and control everything with vim-style keyboard shortcuts.

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)

## Features

- **Interactive TUI** — Full-screen terminal interface with real-time log streaming
- **Service Management** — Start, stop, and restart shell commands or Docker containers
- **Service Groups** — Organize services into groups for common workflows (e.g., `spin dev`)
- **Dependencies** — Define service dependencies with automatic startup ordering
- **Command Palette** — Run ad-hoc commands with `:` (like vim), with fuzzy search
- **Background Scripts** — Minimize running commands to the background
- **MCP Integration** — Built-in MCP server for AI assistants (Cursor, Claude Desktop)
- **Vim Keybindings** — Navigate with `j/k`, `g/G`, search with `/`
- **TypeScript Config** — Type-safe configuration with IntelliSense support

## Installation

```bash
npm install -g spin-cli
```

Or with your preferred package manager:

```bash
pnpm add -g spin-cli
yarn global add spin-cli
```

## Quick Start

1. Initialize spin in your project:

```bash
spin init
```

2. Edit `spin.config.ts` to configure your services:

```typescript
import { defineConfig, shell, docker } from './.spin/cli';

export default defineConfig({
  runnables: {
    api: shell('npm run dev', {
      cwd: './api',
      description: 'API server',
      readyWhen: (output) => output.includes('listening'),
    }),
    
    web: shell('npm run dev', {
      cwd: './web',
      description: 'Web frontend',
    }),
    
    postgres: docker('postgres:15', {
      description: 'PostgreSQL database',
      ports: ['5432:5432'],
      env: { POSTGRES_PASSWORD: 'dev' },
    }),
  },
  
  groups: {
    dev: ['postgres', 'api', 'web'],
  },
});
```

3. Start your services:

```bash
spin          # Start all services
spin dev      # Start the "dev" group
spin api web  # Start specific services
```

## Configuration

### Shell Commands

```typescript
shell('npm run dev', {
  cwd: './packages/api',           // Working directory
  description: 'API server',       // Shown in TUI
  env: { PORT: '3000' },           // Environment variables
  dependsOn: ['postgres'],         // Wait for dependencies
  readyWhen: (output) =>           // Ready detection
    output.includes('Listening'),
  onReady: ({ output, setEnv }) => {
    // Extract dynamic values and share with dependents
    const port = output.match(/port (\d+)/)?.[1];
    if (port) setEnv('API_PORT', port);
  },
})
```

### Docker Containers

```typescript
docker('postgres:15', {
  description: 'PostgreSQL database',
  ports: ['5432:5432'],            // Port mappings
  volumes: ['./data:/var/lib/postgresql/data'],
  env: {
    POSTGRES_USER: 'dev',
    POSTGRES_PASSWORD: 'dev',
    POSTGRES_DB: 'app',
  },
})
```

### Service Groups

```typescript
groups: {
  dev: ['postgres', 'redis', 'api', 'web'],
  backend: ['postgres', 'redis', 'api', 'queue'],
  infra: ['postgres', 'redis'],
}
```

### Dependencies

Services can depend on other services. Spin ensures dependencies are started first and waits for them to be ready before starting dependent services.

```typescript
runnables: {
  postgres: docker('postgres:15', {
    readyWhen: (output) => output.includes('ready to accept connections'),
  }),
  
  api: shell('npm run dev', {
    dependsOn: ['postgres'],  // Waits for postgres to be ready
  }),
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-9` | Switch to service |
| `Tab` | Next service |
| `j/k` | Scroll down/up |
| `g/G` | Go to top/bottom |
| `f` | Toggle follow mode |
| `:` | Open command palette |
| `r` | Restart current service |
| `s` | Start a stopped service |
| `x` | Stop current service |
| `a` | Start current service |
| `R` | Restart all services |
| `b` | View background scripts |
| `?` | Show help |
| `q` | Quit |

## Command Palette

Press `:` to open the command palette. You can:

- Run any shell command (e.g., `:npm test`)
- Execute scripts from `package.json` files
- Run scripts from a configured scripts folder
- Search through command history

Commands run in a dedicated output view where you can:
- View output in real-time
- Minimize to background with `m`
- Cancel with `c`
- Rerun with `r`
- Close with `Escape`

## MCP Integration

Spin includes a built-in [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that allows AI assistants to interact with your services.

### Automatic Setup

When you run `spin init`, spin automatically configures MCP for detected AI tools (Cursor, Claude Desktop).

### Manual Setup

Add to your MCP configuration:

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

### MCP Commands

```bash
spin mcp           # Start MCP server (stdio)
spin mcp install   # Install MCP config to detected tools
spin mcp status    # Show installation status
spin mcp update    # Update .spin folder and install MCP
```

### Available MCP Tools

When spin TUI is running, AI assistants can:
- **list_services** — List all configured services with status
- **get_service_status** — Get detailed status of a service
- **get_logs** — Get recent logs from a service

When spin TUI is not running:
- **start_spin** — Get the command to start spin

## CLI Commands

```bash
spin                      # Start all services
spin <services...>        # Start specific services or groups
spin list                 # List all services and groups
spin init                 # Initialize spin in your project
spin init --personal      # Initialize for personal use (gitignored)
spin mcp                  # Start MCP server
spin uninstall            # Remove spin from your project
spin --help               # Show help
spin --version            # Show version
```

## Team Workflow

Spin is designed for team adoption:

1. **Commit `spin.config.ts`** — Share configuration with your team
2. **`.spin/cli.ts` is auto-generated** — Each developer runs `spin` and the CLI file is generated automatically
3. **MCP installs per-user** — AI tool integrations are installed to user-specific config files

Team members just need to:
```bash
npm install -g spin-cli
spin  # Auto-generates .spin/cli.ts and starts services
```

## Advanced Configuration

### Script Sources

Configure where the command palette finds scripts:

```typescript
import { defineConfig, shell, packageScripts, scriptsFolder } from './.spin/cli';

export default defineConfig({
  runnables: { /* ... */ },
  
  scripts: [
    // Include scripts from all package.json files
    packageScripts(),
    
    // Include scripts from a folder
    scriptsFolder('./scripts', {
      label: 'scripts',
      overrides: {
        'migrate.ts': { confirm: true, description: 'Run database migrations' },
      },
    }),
  ],
});
```

### Shell Commands

Configure command prefixes that bypass fuzzy search and run immediately:

```typescript
export default defineConfig({
  runnables: { /* ... */ },
  
  shellCommands: ['npm', 'pnpm', 'yarn', 'bun', 'git', 'docker'],
});
```

## Requirements

- Node.js >= 18.0.0
- Docker (optional, for Docker containers)

## Development

```bash
# Install dependencies
pnpm install

# Run in watch mode
pnpm dev

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## License

MIT
