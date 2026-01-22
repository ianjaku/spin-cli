import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from './server.js';
import type { SpinConfig } from '../types.js';

// Helper to create a mock config
function createMockConfig(): SpinConfig {
  return {
    runnables: {
      api: { type: 'shell', command: 'npm run dev', description: 'API server' },
      web: { type: 'shell', command: 'npm start', description: 'Web frontend' },
    },
    groups: {
      dev: ['api', 'web'],
    },
  };
}

describe('McpServer', () => {
  describe('constructor', () => {
    it('stores project root and config', () => {
      const config = createMockConfig();
      const server = new McpServer('/path/to/project', config);
      
      expect(server.getProjectRoot()).toBe('/path/to/project');
    });
  });
});

// Note: Full integration tests for the MCP server would require
// mocking the stdio transport and MCP protocol, which is complex.
// The server is primarily tested via manual testing with actual
// MCP clients (Cursor, Claude Desktop).
//
// For unit testing, we test the individual components:
// - state.ts: tested in state.test.ts
// - installer.ts: tested in installer.test.ts
// - tools logic: moved into server.ts, tested via integration
