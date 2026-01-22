import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import {
  detectMcpTargets,
  installMcpServer,
  uninstallMcpServer,
  isSpinMcpInstalled,
  getTargetDisplayName,
  autoInstallMcp,
} from './installer.js';
import type { McpTarget } from './types.js';

// Create a temp directory for each test
let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `spin-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('getTargetDisplayName', () => {
  it('returns correct display name for cursor-global', () => {
    expect(getTargetDisplayName('cursor-global')).toBe('Cursor (global)');
  });

  it('returns correct display name for cursor-project', () => {
    expect(getTargetDisplayName('cursor-project')).toBe('Cursor (project)');
  });

  it('returns correct display name for claude-desktop', () => {
    expect(getTargetDisplayName('claude-desktop')).toBe('Claude Desktop');
  });
});

describe('installMcpServer', () => {
  it('creates config file if it does not exist', () => {
    const configPath = join(testDir, 'mcp.json');
    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: false,
    };

    installMcpServer(target);

    expect(existsSync(configPath)).toBe(true);
    const content = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(content.mcpServers).toBeDefined();
    expect(content.mcpServers.spin).toBeDefined();
    expect(content.mcpServers.spin.command).toBe('spin');
    expect(content.mcpServers.spin.args).toEqual(['mcp']);
  });

  it('adds spin to existing config', () => {
    const configPath = join(testDir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        other: { command: 'other-mcp' },
      },
    }));

    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: true,
    };

    installMcpServer(target);

    const content = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(content.mcpServers.other).toBeDefined();
    expect(content.mcpServers.spin).toBeDefined();
  });

  it('creates parent directories if needed', () => {
    const configPath = join(testDir, 'nested', 'deep', 'mcp.json');
    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: false,
    };

    installMcpServer(target);

    expect(existsSync(configPath)).toBe(true);
  });

  it('overwrites existing spin entry', () => {
    const configPath = join(testDir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        spin: { url: 'http://localhost:1234/old' },
      },
    }));

    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: true,
    };

    installMcpServer(target);

    const content = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(content.mcpServers.spin.command).toBe('spin');
    expect(content.mcpServers.spin.args).toEqual(['mcp']);
  });
});

describe('uninstallMcpServer', () => {
  it('removes spin entry from config', () => {
    const configPath = join(testDir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        spin: { url: 'http://localhost:9847/mcp' },
        other: { command: 'other-mcp' },
      },
    }));

    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: true,
    };

    uninstallMcpServer(target);

    const content = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(content.mcpServers.spin).toBeUndefined();
    expect(content.mcpServers.other).toBeDefined();
  });

  it('handles non-existent config file', () => {
    const configPath = join(testDir, 'nonexistent.json');
    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: false,
    };

    // Should not throw
    expect(() => uninstallMcpServer(target)).not.toThrow();
  });

  it('handles config without mcpServers', () => {
    const configPath = join(testDir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({ other: 'data' }));

    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: true,
    };

    // Should not throw
    expect(() => uninstallMcpServer(target)).not.toThrow();
  });
});

describe('isSpinMcpInstalled', () => {
  it('returns true when spin is installed', () => {
    const configPath = join(testDir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        spin: { url: 'http://localhost:9847/mcp' },
      },
    }));

    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: true,
    };

    expect(isSpinMcpInstalled(target)).toBe(true);
  });

  it('returns false when spin is not installed', () => {
    const configPath = join(testDir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        other: { command: 'other-mcp' },
      },
    }));

    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: true,
    };

    expect(isSpinMcpInstalled(target)).toBe(false);
  });

  it('returns false when config does not exist', () => {
    const configPath = join(testDir, 'nonexistent.json');
    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: false,
    };

    expect(isSpinMcpInstalled(target)).toBe(false);
  });

  it('returns false when config is invalid JSON', () => {
    const configPath = join(testDir, 'mcp.json');
    writeFileSync(configPath, 'not valid json');

    const target: McpTarget = {
      type: 'cursor-global',
      configPath,
      exists: true,
    };

    expect(isSpinMcpInstalled(target)).toBe(false);
  });
});
