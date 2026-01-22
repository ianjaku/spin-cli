import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  defaultShellCommands, 
  docker, 
  kubernetes, 
  scriptsFolder, 
  packageScripts 
} from './helpers.js';

// Mock fs functions
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

describe('helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('defaultShellCommands', () => {
    it('includes common shell commands', () => {
      expect(defaultShellCommands).toContain('git');
      expect(defaultShellCommands).toContain('npm');
      expect(defaultShellCommands).toContain('bun');
      expect(defaultShellCommands).toContain('docker');
      expect(defaultShellCommands).toContain('kubectl');
    });
  });

  describe('docker', () => {
    it('creates docker runner config', () => {
      const config = docker('my-container');
      
      expect(config).toEqual({
        type: 'docker',
        container: 'my-container',
        runner: undefined,
      });
    });

    it('accepts custom runner', () => {
      const config = docker('my-container', { runner: 'bun run' });
      
      expect(config.runner).toBe('bun run');
    });
  });

  describe('kubernetes', () => {
    it('creates kubernetes runner config', () => {
      const config = kubernetes({ selector: 'app=api' });
      
      expect(config).toEqual({
        type: 'kubernetes',
        selector: 'app=api',
      });
    });

    it('accepts all options', () => {
      const config = kubernetes({
        selector: 'app=api',
        container: 'api',
        namespace: 'production',
        runner: 'node',
      });
      
      expect(config.container).toBe('api');
      expect(config.namespace).toBe('production');
      expect(config.runner).toBe('node');
    });
  });

  describe('scriptsFolder', () => {
    it('returns a ScriptSource', () => {
      const source = scriptsFolder('scripts', 'bun');
      
      expect(source.type).toBe('scriptsFolder');
      expect(typeof source.resolve).toBe('function');
    });

    it('resolves scripts from folder', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockImplementation((path) => ({
        isDirectory: () => !String(path).includes('.'),
        isFile: () => String(path).includes('.'),
      } as any));
      vi.mocked(readdirSync).mockReturnValue(['migrate.ts', 'seed.ts', 'README.md'] as any);
      
      const source = scriptsFolder('scripts', 'bun');
      const scripts = await source.resolve();
      
      // Should only include .ts files, not README.md
      expect(scripts).toHaveLength(2);
      expect(scripts[0].displayName).toBe('scripts/migrate.ts');
      expect(scripts[1].displayName).toBe('scripts/seed.ts');
    });

    it('infers label from packages/X/scripts path', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockImplementation((path) => ({
        isDirectory: () => !String(path).includes('.ts'),
        isFile: () => String(path).includes('.ts'),
      } as any));
      vi.mocked(readdirSync).mockReturnValue(['migrate.ts'] as any);
      
      const source = scriptsFolder('packages/remix/scripts', 'bun');
      const scripts = await source.resolve();
      
      expect(scripts[0].displayName).toBe('remix/migrate.ts');
    });

    it('uses custom label when provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockImplementation((path) => ({
        isDirectory: () => !String(path).includes('.ts'),
        isFile: () => String(path).includes('.ts'),
      } as any));
      vi.mocked(readdirSync).mockReturnValue(['migrate.ts'] as any);
      
      const source = scriptsFolder('packages/remix/scripts', 'bun', { label: 'custom' });
      const scripts = await source.resolve();
      
      expect(scripts[0].displayName).toBe('custom/migrate.ts');
    });

    it('applies overrides', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockImplementation((path) => ({
        isDirectory: () => !String(path).includes('.ts'),
        isFile: () => String(path).includes('.ts'),
      } as any));
      vi.mocked(readdirSync).mockReturnValue(['dangerous.ts'] as any);
      
      const source = scriptsFolder('scripts', 'bun', {
        overrides: {
          'dangerous.ts': { confirm: true, description: 'Dangerous!' },
        },
      });
      const scripts = await source.resolve();
      
      expect(scripts[0].confirm).toBe(true);
      expect(scripts[0].description).toBe('Dangerous!');
    });

    it('returns empty array when folder does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      
      const source = scriptsFolder('nonexistent', 'bun');
      const scripts = await source.resolve();
      
      expect(scripts).toEqual([]);
    });

    it('generates correct command for string runner', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockImplementation((path) => ({
        isDirectory: () => !String(path).includes('.ts'),
        isFile: () => String(path).includes('.ts'),
      } as any));
      vi.mocked(readdirSync).mockReturnValue(['migrate.ts'] as any);
      
      const source = scriptsFolder('scripts', 'bun');
      const scripts = await source.resolve();
      
      expect(scripts[0].command).toContain('bun run');
      expect(scripts[0].runnerLabel).toBe('bun run');
    });

    it('generates correct command for docker runner', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockImplementation((path) => ({
        isDirectory: () => !String(path).includes('.ts'),
        isFile: () => String(path).includes('.ts'),
      } as any));
      vi.mocked(readdirSync).mockReturnValue(['migrate.ts'] as any);
      
      const source = scriptsFolder('scripts', docker('my-container'));
      const scripts = await source.resolve();
      
      expect(scripts[0].command).toContain('docker exec');
      expect(scripts[0].command).toContain('my-container');
      expect(scripts[0].runnerLabel).toBe('docker (my-container)');
    });

    it('generates correct command for kubernetes runner', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockImplementation((path) => ({
        isDirectory: () => !String(path).includes('.ts'),
        isFile: () => String(path).includes('.ts'),
      } as any));
      vi.mocked(readdirSync).mockReturnValue(['migrate.ts'] as any);
      
      const source = scriptsFolder('scripts', kubernetes({ selector: 'app=api' }));
      const scripts = await source.resolve();
      
      expect(scripts[0].command).toContain('kubectl exec');
      expect(scripts[0].command).toContain('app=api');
      expect(scripts[0].runnerLabel).toBe('k8s (api)');
    });

    it('only includes script files by extension', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      // The folder itself should be a directory, files inside should be files
      vi.mocked(statSync).mockImplementation((path) => {
        const pathStr = String(path);
        // If it's the scripts folder path, it's a directory
        if (pathStr.endsWith('/scripts') || pathStr === '/project/scripts') {
          return { isDirectory: () => true, isFile: () => false } as any;
        }
        // Everything else is a file
        return { isDirectory: () => false, isFile: () => true } as any;
      });
      vi.mocked(readdirSync).mockReturnValue([
        'script.ts',
        'script.js',
        'script.mjs',
        'script.sh',
        'script.py',
        'script.rb',
        'README.md',
        'config.json',
        '.hidden',
      ] as any);
      
      const source = scriptsFolder('scripts', 'bun');
      const scripts = await source.resolve();
      
      expect(scripts).toHaveLength(6);
      expect(scripts.map(s => s.displayName)).not.toContain('scripts/README.md');
      expect(scripts.map(s => s.displayName)).not.toContain('scripts/config.json');
    });
  });

  describe('packageScripts', () => {
    it('returns a ScriptSource', () => {
      const source = packageScripts();
      
      expect(source.type).toBe('packageScripts');
      expect(typeof source.resolve).toBe('function');
    });

    it('discovers scripts from root package.json', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith('package.json') || 
               String(path) === '/project';
      });
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        scripts: {
          dev: 'next dev',
          build: 'next build',
          test: 'vitest',
        },
      }));
      vi.mocked(readdirSync).mockReturnValue([] as any);
      
      const source = packageScripts();
      const scripts = await source.resolve();
      
      expect(scripts.length).toBeGreaterThanOrEqual(3);
      expect(scripts.find(s => s.displayName === 'dev')).toBeDefined();
      expect(scripts.find(s => s.displayName === 'build')).toBeDefined();
      expect(scripts.find(s => s.displayName === 'test')).toBeDefined();
    });

    it('detects npm from package-lock.json', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        if (String(path).includes('package-lock.json')) return true;
        if (String(path).endsWith('package.json')) return true;
        return false;
      });
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        scripts: { dev: 'next dev' },
      }));
      vi.mocked(readdirSync).mockReturnValue([] as any);
      
      const source = packageScripts();
      const scripts = await source.resolve();
      
      expect(scripts[0].runnerLabel).toBe('npm run');
      expect(scripts[0].command).toBe('npm run dev');
    });

    it('detects bun from bun.lockb', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        if (String(path).includes('bun.lockb')) return true;
        if (String(path).endsWith('package.json')) return true;
        return false;
      });
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        scripts: { dev: 'next dev' },
      }));
      vi.mocked(readdirSync).mockReturnValue([] as any);
      
      const source = packageScripts();
      const scripts = await source.resolve();
      
      expect(scripts[0].runnerLabel).toBe('bun run');
      expect(scripts[0].command).toBe('bun run dev');
    });

    it('detects pnpm from pnpm-lock.yaml', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        if (String(path).includes('pnpm-lock.yaml')) return true;
        if (String(path).endsWith('package.json')) return true;
        return false;
      });
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        scripts: { dev: 'next dev' },
      }));
      vi.mocked(readdirSync).mockReturnValue([] as any);
      
      const source = packageScripts();
      const scripts = await source.resolve();
      
      expect(scripts[0].runnerLabel).toBe('pnpm run');
    });

    it('adds location label for non-root packages', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith('package.json');
      });
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('api')) {
          return JSON.stringify({ scripts: { dev: 'node index.js' } });
        }
        return JSON.stringify({ scripts: {} });
      });
      vi.mocked(readdirSync).mockImplementation((path) => {
        if (String(path) === '/project') {
          return [{ name: 'api', isDirectory: () => true }] as any;
        }
        return [] as any;
      });
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);
      
      const source = packageScripts();
      const scripts = await source.resolve();
      
      const apiScript = scripts.find(s => s.displayName.includes('api'));
      expect(apiScript?.displayName).toBe('dev (api)');
    });

    it('handles malformed package.json gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not json');
      vi.mocked(readdirSync).mockReturnValue([] as any);
      
      const source = packageScripts();
      
      // Should not throw
      const scripts = await source.resolve();
      expect(scripts).toEqual([]);
    });

    it('handles package.json without scripts', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: 'test' }));
      vi.mocked(readdirSync).mockReturnValue([] as any);
      
      const source = packageScripts();
      const scripts = await source.resolve();
      
      expect(scripts).toEqual([]);
    });
  });
});
