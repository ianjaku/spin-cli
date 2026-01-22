import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScriptRegistry } from './registry.js';
import type { ScriptSource, ResolvedScript } from '../types.js';

// Helper to create mock scripts
function createMockScript(overrides: Partial<ResolvedScript> = {}): ResolvedScript {
  return {
    id: 'test-script',
    displayName: 'test/script.ts',
    runnerLabel: 'bun run',
    command: 'bun run test/script.ts',
    cwd: '/test',
    ...overrides,
  };
}

// Helper to create mock source
function createMockSource(scripts: ResolvedScript[]): ScriptSource {
  return {
    type: 'scriptsFolder',
    resolve: vi.fn().mockResolvedValue(scripts),
  };
}

describe('ScriptRegistry', () => {
  describe('init', () => {
    it('resolves all script sources', async () => {
      const scripts1 = [createMockScript({ id: 's1', displayName: 'migrate.ts' })];
      const scripts2 = [createMockScript({ id: 's2', displayName: 'deploy.sh' })];
      
      const source1 = createMockSource(scripts1);
      const source2 = createMockSource(scripts2);
      
      const registry = new ScriptRegistry([source1, source2]);
      await registry.init();
      
      expect(source1.resolve).toHaveBeenCalled();
      expect(source2.resolve).toHaveBeenCalled();
      expect(registry.getAll()).toHaveLength(2);
    });

    it('only initializes once', async () => {
      const source = createMockSource([createMockScript()]);
      
      const registry = new ScriptRegistry([source]);
      await registry.init();
      await registry.init();
      
      expect(source.resolve).toHaveBeenCalledTimes(1);
    });

    it('handles source errors gracefully', async () => {
      const goodSource = createMockSource([createMockScript({ id: 'good' })]);
      const badSource: ScriptSource = {
        type: 'scriptsFolder',
        resolve: vi.fn().mockRejectedValue(new Error('Failed')),
      };
      
      const registry = new ScriptRegistry([goodSource, badSource]);
      
      // Should not throw
      await registry.init();
      
      // Should still have the good scripts
      expect(registry.getAll()).toHaveLength(1);
    });

    it('initializes fuse.js for search', async () => {
      const scripts = [
        createMockScript({ id: 's1', displayName: 'remix/migrate.ts' }),
        createMockScript({ id: 's2', displayName: 'api/migrate.ts' }),
      ];
      
      const registry = new ScriptRegistry([createMockSource(scripts)]);
      await registry.init();
      
      // Search should work with fuzzy matching
      const results = registry.search('mig');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('refresh', () => {
    it('re-resolves all sources', async () => {
      const source = createMockSource([createMockScript()]);
      
      const registry = new ScriptRegistry([source]);
      await registry.init();
      await registry.refresh();
      
      expect(source.resolve).toHaveBeenCalledTimes(2);
    });

    it('clears old scripts before refresh', async () => {
      const source = createMockSource([createMockScript({ id: 's1' })]);
      
      const registry = new ScriptRegistry([source]);
      await registry.init();
      
      // Change what the source returns
      vi.mocked(source.resolve).mockResolvedValue([
        createMockScript({ id: 's2' }),
        createMockScript({ id: 's3' }),
      ]);
      
      await registry.refresh();
      
      expect(registry.getAll()).toHaveLength(2);
      expect(registry.getAll().find(s => s.id === 's1')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns empty array before init', () => {
      const registry = new ScriptRegistry([]);
      expect(registry.getAll()).toEqual([]);
    });

    it('returns all resolved scripts', async () => {
      const scripts = [
        createMockScript({ id: 's1' }),
        createMockScript({ id: 's2' }),
        createMockScript({ id: 's3' }),
      ];
      
      const registry = new ScriptRegistry([createMockSource(scripts)]);
      await registry.init();
      
      expect(registry.getAll()).toHaveLength(3);
    });
  });

  describe('isInitialized', () => {
    it('returns false before init', () => {
      const registry = new ScriptRegistry([]);
      expect(registry.isInitialized()).toBe(false);
    });

    it('returns true after init', async () => {
      const registry = new ScriptRegistry([]);
      await registry.init();
      expect(registry.isInitialized()).toBe(true);
    });
  });

  describe('search', () => {
    it('returns all scripts when query is empty', async () => {
      const scripts = [
        createMockScript({ id: 's1', displayName: 'migrate.ts' }),
        createMockScript({ id: 's2', displayName: 'deploy.sh' }),
      ];
      
      const registry = new ScriptRegistry([createMockSource(scripts)]);
      await registry.init();
      
      expect(registry.search('')).toHaveLength(2);
      expect(registry.search('   ')).toHaveLength(2);
    });

    it('fuzzy matches display names', async () => {
      const scripts = [
        createMockScript({ id: 's1', displayName: 'remix/migrate.ts' }),
        createMockScript({ id: 's2', displayName: 'api/deploy.sh' }),
        createMockScript({ id: 's3', displayName: 'remix/seed.ts' }),
      ];
      
      const registry = new ScriptRegistry([createMockSource(scripts)]);
      await registry.init();
      
      const results = registry.search('remix');
      expect(results.length).toBe(2);
      expect(results.every(s => s.displayName.includes('remix'))).toBe(true);
    });

    it('fuzzy matches partial names', async () => {
      const scripts = [
        createMockScript({ id: 's1', displayName: 'remix/migrate.ts' }),
        createMockScript({ id: 's2', displayName: 'api/migrations.ts' }),
        createMockScript({ id: 's3', displayName: 'deploy.sh' }),
      ];
      
      const registry = new ScriptRegistry([createMockSource(scripts)]);
      await registry.init();
      
      const results = registry.search('mig');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('matches descriptions', async () => {
      const scripts = [
        createMockScript({ 
          id: 's1', 
          displayName: 'script.ts',
          description: 'Run database migrations' 
        }),
        createMockScript({ id: 's2', displayName: 'other.ts' }),
      ];
      
      const registry = new ScriptRegistry([createMockSource(scripts)]);
      await registry.init();
      
      const results = registry.search('database');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].description).toContain('database');
    });

    it('returns empty array when no matches', async () => {
      const scripts = [
        createMockScript({ id: 's1', displayName: 'migrate.ts' }),
      ];
      
      const registry = new ScriptRegistry([createMockSource(scripts)]);
      await registry.init();
      
      const results = registry.search('zzzznotfound');
      expect(results).toHaveLength(0);
    });

    it('falls back to substring search when fuse not initialized', async () => {
      // Don't init - fuse won't be set up
      const registry = new ScriptRegistry([]);
      
      // Manually set scripts without init
      (registry as any).scripts = [
        createMockScript({ displayName: 'MIGRATE.ts' }),
        createMockScript({ displayName: 'deploy.sh' }),
      ];
      
      // Should still find via case-insensitive substring
      const results = registry.search('migrate');
      expect(results).toHaveLength(1);
    });
  });
});
