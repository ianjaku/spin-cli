import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunnableManager } from './manager.js';
import type { SpinConfig } from '../types.js';
import { EventEmitter } from 'node:events';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';

// Helper to create a mock process
function createMockProcess() {
  const proc = new EventEmitter() as any;
  proc.pid = 12345;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.killed = false;
  return proc;
}

// Helper to create a basic config
function createConfig(runnables: SpinConfig['runnables'] = {}): SpinConfig {
  return {
    runnables,
    defaults: {
      maxOutputLines: 100,
    },
  };
}

describe('RunnableManager', () => {
  let mockProcess: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates a manager with config', () => {
      const config = createConfig();
      const manager = new RunnableManager(config);
      
      expect(manager).toBeInstanceOf(RunnableManager);
      expect(manager.getAll()).toEqual([]);
    });
  });

  describe('init', () => {
    it('initializes runnables from config', () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
        web: { type: 'shell', command: 'npm run start' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api', 'web']);
      
      const instances = manager.getAll();
      expect(instances).toHaveLength(2);
      expect(instances.map(i => i.id)).toContain('api');
      expect(instances.map(i => i.id)).toContain('web');
    });

    it('sets initial status to stopped', () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      
      const instance = manager.get('api');
      expect(instance?.status).toBe('stopped');
    });

    it('uses id as name if name not provided', () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      
      const instance = manager.get('api');
      expect(instance?.definition.name).toBe('api');
    });

    it('preserves custom name from definition', () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev', name: 'API Server' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      
      const instance = manager.get('api');
      expect(instance?.definition.name).toBe('API Server');
    });

    it('ignores unknown runnable ids', () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api', 'unknown']);
      
      expect(manager.getAll()).toHaveLength(1);
    });

    it('initializes empty output arrays', () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      
      const instance = manager.get('api');
      expect(instance?.stdout).toEqual([]);
      expect(instance?.stderr).toEqual([]);
      expect(instance?.output).toEqual([]);
    });
  });

  describe('get', () => {
    it('returns instance by id', () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      
      const instance = manager.get('api');
      expect(instance).toBeDefined();
      expect(instance?.id).toBe('api');
    });

    it('returns undefined for unknown id', () => {
      const config = createConfig();
      const manager = new RunnableManager(config);
      
      expect(manager.get('unknown')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns all instances as array', () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
        web: { type: 'shell', command: 'npm run start' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api', 'web']);
      
      const instances = manager.getAll();
      expect(Array.isArray(instances)).toBe(true);
      expect(instances).toHaveLength(2);
    });

    it('returns empty array when no instances', () => {
      const config = createConfig();
      const manager = new RunnableManager(config);
      
      expect(manager.getAll()).toEqual([]);
    });
  });

  describe('start', () => {
    it('spawns process with correct command', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      expect(spawn).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev'],
        expect.objectContaining({
          shell: true,
        })
      );
    });

    it('spawns process with cwd from definition', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev', cwd: '/app/api' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      expect(spawn).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev'],
        expect.objectContaining({
          cwd: '/app/api',
        })
      );
    });

    it('merges env from defaults and definition', async () => {
      const config: SpinConfig = {
        runnables: {
          api: { type: 'shell', command: 'npm run dev', env: { PORT: '3000' } },
        },
        defaults: {
          env: { NODE_ENV: 'development' },
        },
      };
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      expect(spawn).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev'],
        expect.objectContaining({
          env: expect.objectContaining({
            NODE_ENV: 'development',
            PORT: '3000',
            FORCE_COLOR: '1',
          }),
        })
      );
    });

    it('emits status-change to starting', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      
      const statusChanges: string[] = [];
      manager.on('status-change', (id, status) => {
        statusChanges.push(status);
      });
      
      await manager.start('api');
      
      expect(statusChanges).toContain('starting');
    });

    it('transitions to running status when no readyWhen after grace period', async () => {
      vi.useFakeTimers();
      
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      
      const statusChanges: string[] = [];
      manager.on('status-change', (id, status) => {
        statusChanges.push(status);
      });
      
      await manager.start('api');
      
      // Should be starting, not running yet (grace period)
      expect(manager.get('api')?.status).toBe('starting');
      
      // Advance past grace period
      await vi.advanceTimersByTimeAsync(500);
      
      expect(statusChanges).toContain('running');
      expect(manager.get('api')?.status).toBe('running');
      
      vi.useRealTimers();
    });

    it('waits for readyWhen to mark as running', async () => {
      const config = createConfig({
        api: { 
          type: 'shell', 
          command: 'npm run dev',
          readyWhen: (output) => output.includes('Ready'),
        },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      // Should be starting, not running yet
      expect(manager.get('api')?.status).toBe('starting');
      
      // Simulate output
      mockProcess.stdout.emit('data', Buffer.from('Starting server...\n'));
      expect(manager.get('api')?.status).toBe('starting');
      
      // Simulate ready output
      mockProcess.stdout.emit('data', Buffer.from('Ready on port 3000\n'));
      expect(manager.get('api')?.status).toBe('running');
    });

    it('clears previous output on restart', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      // Add some output
      mockProcess.stdout.emit('data', Buffer.from('Line 1\nLine 2\n'));
      expect(manager.get('api')?.output.length).toBeGreaterThan(0);
      
      // Mock process.kill
      const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
      
      // Create new mock process for restart
      const newMockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(newMockProcess);
      
      // Stop the process first (proper restart flow)
      const stopPromise = manager.stop('api');
      mockProcess.emit('exit', null, 'SIGTERM');
      await stopPromise;
      
      // Now start again
      await manager.start('api');
      
      // Output should be cleared
      expect(manager.get('api')?.output).toEqual([]);
      
      processKill.mockRestore();
    });

    it('throws for unknown runnable', async () => {
      const config = createConfig();
      const manager = new RunnableManager(config);
      
      await expect(manager.start('unknown')).rejects.toThrow('Unknown runnable: unknown');
    });

    it('throws for runnable without command', async () => {
      const config = createConfig({
        api: { type: 'shell', command: '' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      
      await expect(manager.start('api')).rejects.toThrow('has no command');
    });

    it('does not restart if already running', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      // Clear the mock
      vi.mocked(spawn).mockClear();
      
      // Try to start again
      await manager.start('api');
      
      // Should not spawn again
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe('output handling', () => {
    it('captures stdout output', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      mockProcess.stdout.emit('data', Buffer.from('Hello\nWorld\n'));
      
      const instance = manager.get('api');
      expect(instance?.stdout).toContain('Hello');
      expect(instance?.stdout).toContain('World');
      expect(instance?.output).toContain('Hello');
      expect(instance?.output).toContain('World');
    });

    it('captures stderr output', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      mockProcess.stderr.emit('data', Buffer.from('Error: something\n'));
      
      const instance = manager.get('api');
      expect(instance?.stderr).toContain('Error: something');
      expect(instance?.output).toContain('Error: something');
    });

    it('emits output events', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      
      const outputs: Array<{ id: string; line: string; stream: string }> = [];
      manager.on('output', (id, line, stream) => {
        outputs.push({ id, line, stream });
      });
      
      await manager.start('api');
      mockProcess.stdout.emit('data', Buffer.from('stdout line\n'));
      mockProcess.stderr.emit('data', Buffer.from('stderr line\n'));
      
      expect(outputs).toContainEqual({ id: 'api', line: 'stdout line', stream: 'stdout' });
      expect(outputs).toContainEqual({ id: 'api', line: 'stderr line', stream: 'stderr' });
    });

    it('limits output lines to maxOutputLines', async () => {
      const config: SpinConfig = {
        runnables: {
          api: { type: 'shell', command: 'npm run dev' },
        },
        defaults: {
          maxOutputLines: 5,
        },
      };
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      // Send more lines than the limit
      for (let i = 0; i < 10; i++) {
        mockProcess.stdout.emit('data', Buffer.from(`Line ${i}\n`));
      }
      
      const instance = manager.get('api');
      expect(instance?.output.length).toBe(5);
      // Should keep the most recent lines
      expect(instance?.output).toContain('Line 9');
      expect(instance?.output).not.toContain('Line 0');
    });
  });

  describe('process exit handling', () => {
    it('sets status to stopped on clean exit', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      mockProcess.emit('exit', 0, null);
      
      expect(manager.get('api')?.status).toBe('stopped');
    });

    it('sets status to stopped on SIGTERM', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      mockProcess.emit('exit', null, 'SIGTERM');
      
      expect(manager.get('api')?.status).toBe('stopped');
    });

    it('sets status to error on non-zero exit', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      mockProcess.emit('exit', 1, null);
      
      const instance = manager.get('api');
      expect(instance?.status).toBe('error');
      expect(instance?.error).toContain('Exited with code 1');
    });

    it('sets status to error on process error', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      mockProcess.emit('error', new Error('ENOENT'));
      
      const instance = manager.get('api');
      expect(instance?.status).toBe('error');
      expect(instance?.error).toContain('ENOENT');
    });
  });

  describe('stop', () => {
    it('kills the process', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      // Mock process.kill for process group
      const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
      
      // Start stop and immediately emit exit
      const stopPromise = manager.stop('api');
      mockProcess.emit('exit', null, 'SIGTERM');
      
      await stopPromise;
      
      expect(processKill).toHaveBeenCalledWith(-12345, 'SIGTERM');
      
      processKill.mockRestore();
    });

    it('does nothing if process not running', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      
      // Should not throw
      await manager.stop('api');
    });

    it('does nothing for unknown runnable', async () => {
      const config = createConfig();
      const manager = new RunnableManager(config);
      
      // Should not throw
      await manager.stop('unknown');
    });
  });

  describe('restart', () => {
    it('stops then starts the runnable', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api']);
      await manager.start('api');
      
      // Mock process.kill
      const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
      
      // Create new mock for the restart
      const newMockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(newMockProcess);
      
      // Start restart
      const restartPromise = manager.restart('api');
      
      // Emit exit for the old process
      mockProcess.emit('exit', null, 'SIGTERM');
      
      await restartPromise;
      
      // Should have spawned again
      expect(spawn).toHaveBeenCalledTimes(2);
      
      processKill.mockRestore();
    });
  });

  describe('stopAll', () => {
    it('stops all running instances', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
        web: { type: 'shell', command: 'npm run start' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api', 'web']);
      
      // Create different mock processes for each
      const mockProc1 = createMockProcess();
      const mockProc2 = createMockProcess();
      mockProc2.pid = 12346;
      
      vi.mocked(spawn)
        .mockReturnValueOnce(mockProc1)
        .mockReturnValueOnce(mockProc2);
      
      await manager.start('api');
      await manager.start('web');
      
      // Mock process.kill
      const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
      
      // Start stopAll
      const stopPromise = manager.stopAll();
      
      // Emit exit for both
      mockProc1.emit('exit', null, 'SIGTERM');
      mockProc2.emit('exit', null, 'SIGTERM');
      
      await stopPromise;
      
      expect(manager.get('api')?.status).toBe('stopped');
      expect(manager.get('web')?.status).toBe('stopped');
      
      processKill.mockRestore();
    });
  });

  describe('startAll', () => {
    it('starts all initialized instances', async () => {
      vi.useFakeTimers();
      
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
        web: { type: 'shell', command: 'npm run start' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api', 'web']);
      
      manager.startAll();
      
      // Give it a tick to process
      await vi.advanceTimersByTimeAsync(0);
      
      expect(spawn).toHaveBeenCalledTimes(2);
      
      // Initially starting (grace period)
      expect(manager.get('api')?.status).toBe('starting');
      expect(manager.get('web')?.status).toBe('starting');
      
      // Advance past grace period
      await vi.advanceTimersByTimeAsync(500);
      
      expect(manager.get('api')?.status).toBe('running');
      expect(manager.get('web')?.status).toBe('running');
      
      vi.useRealTimers();
    });
  });

  describe('dependsOn', () => {
    it('sets waiting status with waitingFor when dependencies exist', async () => {
      const config = createConfig({
        db: { 
          type: 'shell', 
          command: 'docker-compose up db',
          readyWhen: (output) => output.includes('ready'),
        },
        api: { type: 'shell', command: 'npm run dev', dependsOn: ['db'] },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['db', 'api']);
      
      // Start all - api should go to waiting state
      manager.startAll();
      
      // Give it a tick to process
      await new Promise(resolve => setImmediate(resolve));
      
      const apiInstance = manager.get('api');
      expect(apiInstance?.status).toBe('waiting');
      expect(apiInstance?.waitingFor).toEqual(['db']);
    });

    it('starts dependent after dependency becomes running', async () => {
      vi.useFakeTimers();
      
      const mockProc1 = createMockProcess();
      const mockProc2 = createMockProcess();
      mockProc2.pid = 12346;
      
      vi.mocked(spawn)
        .mockReturnValueOnce(mockProc1)
        .mockReturnValueOnce(mockProc2);
      
      const config = createConfig({
        db: { type: 'shell', command: 'docker-compose up db' },
        api: { type: 'shell', command: 'npm run dev', dependsOn: ['db'] },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['db', 'api']);
      
      manager.startAll();
      
      // Give it a tick to process
      await vi.advanceTimersByTimeAsync(0);
      
      // db should be starting (grace period)
      expect(manager.get('db')?.status).toBe('starting');
      // api should be waiting for db
      expect(manager.get('api')?.status).toBe('waiting');
      
      // Advance past grace period - db becomes running
      await vi.advanceTimersByTimeAsync(500);
      
      expect(manager.get('db')?.status).toBe('running');
      
      // api should now be starting/running since db is running
      await vi.advanceTimersByTimeAsync(0);
      expect(['starting', 'running']).toContain(manager.get('api')?.status);
      
      vi.useRealTimers();
    });

    it('waits for multiple dependencies', async () => {
      const mockProc1 = createMockProcess();
      const mockProc2 = createMockProcess();
      const mockProc3 = createMockProcess();
      mockProc2.pid = 12346;
      mockProc3.pid = 12347;
      
      vi.mocked(spawn)
        .mockReturnValueOnce(mockProc1)
        .mockReturnValueOnce(mockProc2)
        .mockReturnValueOnce(mockProc3);
      
      const config = createConfig({
        db: { 
          type: 'shell', 
          command: 'docker-compose up db',
          readyWhen: (output) => output.includes('ready'),
        },
        cache: { 
          type: 'shell', 
          command: 'docker-compose up redis',
          readyWhen: (output) => output.includes('ready'),
        },
        api: { type: 'shell', command: 'npm run dev', dependsOn: ['db', 'cache'] },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['db', 'cache', 'api']);
      
      manager.startAll();
      await new Promise(resolve => setImmediate(resolve));
      
      // api should be waiting for both
      expect(manager.get('api')?.status).toBe('waiting');
      expect(manager.get('api')?.waitingFor).toEqual(['db', 'cache']);
      
      // Make db ready
      mockProc1.stdout.emit('data', Buffer.from('db ready\n'));
      await new Promise(resolve => setImmediate(resolve));
      
      // api should still be waiting (cache not ready)
      expect(manager.get('api')?.status).toBe('waiting');
      
      // Make cache ready
      mockProc2.stdout.emit('data', Buffer.from('cache ready\n'));
      await new Promise(resolve => setImmediate(resolve));
      
      // Now api should be starting/running
      expect(['starting', 'running']).toContain(manager.get('api')?.status);
    });

    it('starts services without dependencies immediately', async () => {
      vi.useFakeTimers();
      
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev' },
        web: { type: 'shell', command: 'npm run start' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api', 'web']);
      
      manager.startAll();
      await vi.advanceTimersByTimeAsync(0);
      
      // Both should be starting immediately (no waiting state)
      expect(manager.get('api')?.status).toBe('starting');
      expect(manager.get('web')?.status).toBe('starting');
      
      // After grace period, both should be running
      await vi.advanceTimersByTimeAsync(500);
      
      expect(manager.get('api')?.status).toBe('running');
      expect(manager.get('web')?.status).toBe('running');
      
      vi.useRealTimers();
    });

    it('throws on dependency cycle', async () => {
      const config = createConfig({
        a: { type: 'shell', command: 'cmd', dependsOn: ['b'] },
        b: { type: 'shell', command: 'cmd', dependsOn: ['a'] },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['a', 'b']);
      
      await expect(manager.startAll()).rejects.toThrow('Dependency cycle detected');
    });

    it('throws on non-existent dependency with helpful message', async () => {
      const config = createConfig({
        api: { type: 'shell', command: 'npm run dev', dependsOn: ['typo'] },
        db: { type: 'shell', command: 'docker-compose up db' },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['api', 'db']);
      
      await expect(manager.startAll()).rejects.toThrow('Unknown dependency "typo" in runnable "api"');
    });

    it('keeps dependent in waiting state when dependency fails', async () => {
      const mockProc1 = createMockProcess();
      
      vi.mocked(spawn).mockReturnValueOnce(mockProc1);
      
      const config = createConfig({
        db: { 
          type: 'shell', 
          command: 'docker-compose up db',
          readyWhen: (output) => output.includes('ready'),
        },
        api: { type: 'shell', command: 'npm run dev', dependsOn: ['db'] },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['db', 'api']);
      
      manager.startAll();
      await new Promise(resolve => setImmediate(resolve));
      
      // api should be waiting
      expect(manager.get('api')?.status).toBe('waiting');
      
      // db crashes
      mockProc1.emit('exit', 1, null);
      await new Promise(resolve => setImmediate(resolve));
      
      // api should still be waiting (not crashed)
      expect(manager.get('api')?.status).toBe('waiting');
      expect(manager.get('api')?.waitingFor).toEqual(['db']);
    });

    it('auto-starts dependent when failed dependency recovers', async () => {
      const mockProc1 = createMockProcess();
      const mockProc2 = createMockProcess();
      const mockProc3 = createMockProcess();
      mockProc2.pid = 12346;
      mockProc3.pid = 12347;
      
      vi.mocked(spawn)
        .mockReturnValueOnce(mockProc1)
        .mockReturnValueOnce(mockProc2)
        .mockReturnValueOnce(mockProc3);
      
      const config = createConfig({
        db: { 
          type: 'shell', 
          command: 'docker-compose up db',
          readyWhen: (output) => output.includes('ready'),
        },
        api: { type: 'shell', command: 'npm run dev', dependsOn: ['db'] },
      });
      
      const manager = new RunnableManager(config);
      manager.init(['db', 'api']);
      
      manager.startAll();
      await new Promise(resolve => setImmediate(resolve));
      
      // api should be waiting
      expect(manager.get('api')?.status).toBe('waiting');
      
      // db crashes
      mockProc1.emit('exit', 1, null);
      await new Promise(resolve => setImmediate(resolve));
      
      // api still waiting
      expect(manager.get('api')?.status).toBe('waiting');
      
      // Restart db manually
      await manager.start('db');
      await new Promise(resolve => setImmediate(resolve));
      
      // db still starting (has readyWhen)
      expect(manager.get('db')?.status).toBe('starting');
      
      // Make db ready
      mockProc2.stdout.emit('data', Buffer.from('db ready\n'));
      await new Promise(resolve => setImmediate(resolve));
      
      // Now api should auto-start via dependency watcher
      expect(['starting', 'running']).toContain(manager.get('api')?.status);
    });
  });
});
