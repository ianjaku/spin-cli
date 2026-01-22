/**
 * MCP auto-installation for Cursor and Claude
 * 
 * Detects installed AI tools and configures them to connect to spin's MCP server.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import type { McpTarget } from './types.js';

/**
 * Get all possible MCP target locations
 */
export function getMcpTargetPaths(): Array<{ type: McpTarget['type']; path: string }> {
  const home = homedir();
  const targets: Array<{ type: McpTarget['type']; path: string }> = [];

  // Cursor global config
  targets.push({
    type: 'cursor-global',
    path: join(home, '.cursor', 'mcp.json'),
  });

  // Cursor project-level config (in current directory)
  targets.push({
    type: 'cursor-project',
    path: join(process.cwd(), '.cursor', 'mcp.json'),
  });

  // Claude Desktop config (platform-specific)
  const os = platform();
  if (os === 'darwin') {
    targets.push({
      type: 'claude-desktop',
      path: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    });
  } else if (os === 'linux') {
    targets.push({
      type: 'claude-desktop',
      path: join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    });
  } else if (os === 'win32') {
    targets.push({
      type: 'claude-desktop',
      path: join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
    });
  }

  return targets;
}

/**
 * Detect which MCP targets are available on this system
 */
export function detectMcpTargets(): McpTarget[] {
  const targetPaths = getMcpTargetPaths();
  const detected: McpTarget[] = [];

  for (const { type, path } of targetPaths) {
    // Check if the parent directory exists (indicating the tool is installed)
    const parentDir = dirname(path);
    
    // For project-level cursor, check if .cursor folder exists
    if (type === 'cursor-project') {
      const cursorDir = join(process.cwd(), '.cursor');
      if (existsSync(cursorDir)) {
        detected.push({
          type,
          configPath: path,
          exists: existsSync(path),
        });
      }
      continue;
    }

    // For global configs, check if parent directory exists
    if (existsSync(parentDir)) {
      detected.push({
        type,
        configPath: path,
        exists: existsSync(path),
      });
    }
  }

  return detected;
}

/**
 * Read existing MCP config or return empty config
 */
function readMcpConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }

  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Write MCP config to file
 */
function writeMcpConfig(path: string, config: Record<string, unknown>): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Get the MCP server entry for spin
 */
function getSpinMcpEntry(): Record<string, unknown> {
  return {
    command: 'spin',
    args: ['mcp'],
  };
}

/**
 * Install spin MCP server to a specific target
 */
export function installMcpServer(target: McpTarget): void {
  const config = readMcpConfig(target.configPath);

  // Ensure mcpServers object exists
  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }

  // Add spin entry
  (config.mcpServers as Record<string, unknown>).spin = getSpinMcpEntry();

  writeMcpConfig(target.configPath, config);
}

/**
 * Uninstall spin MCP server from a specific target
 */
export function uninstallMcpServer(target: McpTarget): void {
  if (!existsSync(target.configPath)) {
    return;
  }

  const config = readMcpConfig(target.configPath);

  // Remove spin entry if it exists
  if (config.mcpServers && typeof config.mcpServers === 'object') {
    delete (config.mcpServers as Record<string, unknown>).spin;
  }

  writeMcpConfig(target.configPath, config);
}

/**
 * Check if spin MCP is installed in a target
 */
export function isSpinMcpInstalled(target: McpTarget): boolean {
  if (!existsSync(target.configPath)) {
    return false;
  }

  const config = readMcpConfig(target.configPath);
  return !!(
    config.mcpServers &&
    typeof config.mcpServers === 'object' &&
    'spin' in (config.mcpServers as Record<string, unknown>)
  );
}

/**
 * Get human-readable name for a target type
 */
export function getTargetDisplayName(type: McpTarget['type']): string {
  switch (type) {
    case 'cursor-global':
      return 'Cursor (global)';
    case 'cursor-project':
      return 'Cursor (project)';
    case 'claude-desktop':
      return 'Claude Desktop';
  }
}

/**
 * Auto-install MCP to all detected targets
 * Returns list of targets that were installed to
 */
export function autoInstallMcp(): McpTarget[] {
  const targets = detectMcpTargets();
  const installed: McpTarget[] = [];

  for (const target of targets) {
    if (!isSpinMcpInstalled(target)) {
      try {
        installMcpServer(target);
        installed.push(target);
      } catch {
        // Skip targets that fail to install
      }
    }
  }

  return installed;
}
