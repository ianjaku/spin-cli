/**
 * MCP server for spin using stdio transport
 * 
 * This server is spawned by AI assistants via `spin mcp` command.
 * It reads state from the spin TUI process (if running) or falls back to config.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../config/loader.js';
import { findProjectRoot, findStateForCurrentDir, readState, type SpinState } from './state.js';
import type { SpinConfig } from '../types.js';
import type { ServiceInfo, LogEntry } from './types.js';

/**
 * Tool definitions - varies based on whether spin is running
 */
function getToolDefinitions(spinRunning: boolean) {
  const tools = [
    {
      name: 'list_services',
      description: 'List all configured services and their current status',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
    {
      name: 'get_service_status',
      description: 'Get detailed status of a specific service',
      inputSchema: {
        type: 'object' as const,
        properties: {
          service: {
            type: 'string',
            description: 'The service ID',
          },
        },
        required: ['service'],
      },
    },
  ];

  if (spinRunning) {
    // Additional tools when spin TUI is running
    tools.push(
      {
        name: 'get_logs',
        description: 'Get recent logs from a service',
        inputSchema: {
          type: 'object' as const,
          properties: {
            service: {
              type: 'string',
              description: 'The service ID to get logs from',
            },
            lines: {
              type: 'number',
              description: 'Number of lines to return (default: 50)',
            },
          },
          required: ['service'],
        },
      },
    );
  } else {
    // Tool to start spin when not running
    tools.push(
      {
        name: 'start_spin',
        description: 'Start the spin development environment. Returns the command to run.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            group: {
              type: 'string',
              description: 'Optional group name to start (e.g., "dev", "backend")',
            },
          },
          required: [] as string[],
        },
      },
    );
  }

  return tools;
}

/**
 * Execute a tool
 */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  state: SpinState | null,
  config: SpinConfig,
  projectRoot: string
): Promise<unknown> {
  const spinRunning = state !== null;

  switch (name) {
    case 'list_services': {
      const services: ServiceInfo[] = [];
      
      for (const [id, def] of Object.entries(config.runnables)) {
        const stateInfo = state?.services[id];
        services.push({
          id,
          name: def.name || id,
          status: stateInfo?.status || 'stopped',
          description: def.description,
          error: stateInfo?.error,
          startedAt: stateInfo?.startedAt,
        });
      }
      
      return {
        spinRunning,
        services,
      };
    }

    case 'get_service_status': {
      const serviceId = args.service as string;
      const def = config.runnables[serviceId];
      
      if (!def) {
        return { error: `Service '${serviceId}' not found` };
      }
      
      const stateInfo = state?.services[serviceId];
      return {
        id: serviceId,
        name: def.name || serviceId,
        status: stateInfo?.status || 'stopped',
        description: def.description,
        error: stateInfo?.error,
        startedAt: stateInfo?.startedAt,
        spinRunning,
      };
    }

    case 'get_logs': {
      if (!spinRunning) {
        return { error: 'Spin is not running. Start it with `spin` or `spin <group>`' };
      }
      
      const serviceId = args.service as string;
      const lines = (args.lines as number) || 50;
      
      if (!config.runnables[serviceId]) {
        return { error: `Service '${serviceId}' not found` };
      }
      
      const serviceLogs = state?.logs[serviceId] || [];
      const logs: LogEntry[] = serviceLogs.slice(-lines).map(line => ({
        line,
        stream: 'stdout' as const, // State doesn't track stream info
      }));
      
      return { logs };
    }

    case 'start_spin': {
      const group = args.group as string | undefined;
      const command = group ? `spin ${group}` : 'spin';
      
      return {
        message: `Run the following command to start spin:`,
        command,
        cwd: projectRoot,
        hint: 'The spin TUI will start and manage your services. Once running, more tools will be available.',
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Start the MCP server (stdio mode)
 */
export async function startMcpServer(): Promise<void> {
  // Find project root
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error('Error: No spin.config.ts found. Run `spin init` first.');
    process.exit(1);
  }

  // Load config
  let config: SpinConfig;
  try {
    process.chdir(projectRoot);
    config = await loadConfig();
  } catch (error) {
    console.error(`Error loading config: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // Check if spin TUI is running
  const state = readState(projectRoot);
  const spinRunning = state !== null;

  // Create MCP server
  const server = new Server(
    { name: 'spin', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Re-check state on each request (spin might have started/stopped)
    const currentState = readState(projectRoot);
    const currentlyRunning = currentState !== null;
    
    return {
      tools: getToolDefinitions(currentlyRunning),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    // Re-check state on each request
    const currentState = readState(projectRoot);

    try {
      const result = await executeTool(name, args ?? {}, currentState, config, projectRoot);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// For backwards compatibility with tests - keeping the class interface
export class McpServer {
  private projectRoot: string;
  private config: SpinConfig;

  constructor(projectRoot: string, config: SpinConfig) {
    this.projectRoot = projectRoot;
    this.config = config;
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }
}
