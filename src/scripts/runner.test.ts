import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScriptRunner } from './runner.js';
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

describe('ScriptRunner', () => {
  let mockProcess: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts with idle status', () => {
      const runner = new ScriptRunner();
      expect(runner.status).toBe('idle');
    });

    it('starts with empty output', () => {
      const runner = new ScriptRunner();
      expect(runner.output).toEqual([]);
    });

    it('starts with zero duration', () => {
      const runner = new ScriptRunner();
      expect(runner.duration).toBe(0);
    });

    it('isRunning returns false initially', () => {
      const runner = new ScriptRunner();
      expect(runner.isRunning()).toBe(false);
    });
  });

  describe('run', () => {
    it('spawns process with command and cwd', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      expect(spawn).toHaveBeenCalledWith(
        'npm test',
        expect.objectContaining({
          cwd: '/project',
          shell: true,
        })
      );
    });

    it('sets status to running', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      expect(runner.status).toBe('running');
    });

    it('isRunning returns true while running', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      expect(runner.isRunning()).toBe(true);
    });

    it('clears previous output', () => {
      const runner = new ScriptRunner();
      
      // First run
      runner.run('npm test', '/project');
      mockProcess.stdout.emit('data', Buffer.from('Line 1\n'));
      mockProcess.emit('exit', 0, null);
      
      expect(runner.output).toContain('Line 1');
      
      // Second run - create new mock
      const newMockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(newMockProcess);
      
      runner.run('npm test', '/project');
      
      expect(runner.output).toEqual([]);
    });

    it('sets FORCE_COLOR env variable', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      expect(spawn).toHaveBeenCalledWith(
        'npm test',
        expect.objectContaining({
          env: expect.objectContaining({
            FORCE_COLOR: '1',
          }),
        })
      );
    });

    it('cancels previous process if running', () => {
      const runner = new ScriptRunner();
      
      // Mock process.kill for process group
      const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
      
      // First run
      runner.run('npm test', '/project');
      
      // Second run while first is still running
      const newMockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(newMockProcess);
      
      runner.run('npm test2', '/project');
      
      // Should have tried to kill the first process
      expect(processKill).toHaveBeenCalledWith(-12345, 'SIGTERM');
      
      processKill.mockRestore();
    });
  });

  describe('output handling', () => {
    it('captures stdout output', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      mockProcess.stdout.emit('data', Buffer.from('Hello\nWorld\n'));
      
      expect(runner.output).toContain('Hello');
      expect(runner.output).toContain('World');
    });

    it('captures stderr output', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      mockProcess.stderr.emit('data', Buffer.from('Error: something\n'));
      
      expect(runner.output).toContain('Error: something');
    });

    it('emits output events for stdout', () => {
      const runner = new ScriptRunner();
      const outputs: string[] = [];
      
      runner.on('output', (line) => {
        outputs.push(line);
      });
      
      runner.run('npm test', '/project');
      mockProcess.stdout.emit('data', Buffer.from('Line 1\nLine 2\n'));
      
      expect(outputs).toContain('Line 1');
      expect(outputs).toContain('Line 2');
    });

    it('emits output events for stderr', () => {
      const runner = new ScriptRunner();
      const outputs: string[] = [];
      
      runner.on('output', (line) => {
        outputs.push(line);
      });
      
      runner.run('npm test', '/project');
      mockProcess.stderr.emit('data', Buffer.from('Error line\n'));
      
      expect(outputs).toContain('Error line');
    });

    it('ignores empty lines', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      mockProcess.stdout.emit('data', Buffer.from('\n\nHello\n\n'));
      
      expect(runner.output).toEqual(['Hello']);
    });
  });

  describe('exit handling', () => {
    it('sets status to success on exit code 0', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      mockProcess.emit('exit', 0, null);
      
      expect(runner.status).toBe('success');
      expect(runner.isRunning()).toBe(false);
    });

    it('sets status to error on non-zero exit code', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      mockProcess.emit('exit', 1, null);
      
      expect(runner.status).toBe('error');
      expect(runner.isRunning()).toBe(false);
    });

    it('emits exit event', () => {
      const runner = new ScriptRunner();
      let exitCode: number | null = null;
      let exitSignal: string | null = null;
      
      runner.on('exit', (code, signal) => {
        exitCode = code;
        exitSignal = signal;
      });
      
      runner.run('npm test', '/project');
      mockProcess.emit('exit', 0, null);
      
      expect(exitCode).toBe(0);
      expect(exitSignal).toBeNull();
    });

    it('emits exit event with signal', () => {
      const runner = new ScriptRunner();
      let exitSignal: string | null = null;
      
      runner.on('exit', (code, signal) => {
        exitSignal = signal;
      });
      
      runner.run('npm test', '/project');
      mockProcess.emit('exit', null, 'SIGTERM');
      
      expect(exitSignal).toBe('SIGTERM');
    });
  });

  describe('error handling', () => {
    it('sets status to error on process error', () => {
      const runner = new ScriptRunner();
      
      // Listen to error event to prevent unhandled error
      runner.on('error', () => {});
      
      runner.run('npm test', '/project');
      mockProcess.emit('error', new Error('ENOENT'));
      
      expect(runner.status).toBe('error');
      expect(runner.isRunning()).toBe(false);
    });

    it('emits error event', () => {
      const runner = new ScriptRunner();
      let emittedError: Error | undefined;
      
      runner.on('error', (error) => {
        emittedError = error;
      });
      
      runner.run('npm test', '/project');
      mockProcess.emit('error', new Error('ENOENT'));
      
      expect(emittedError).toBeInstanceOf(Error);
      expect(emittedError!.message).toBe('ENOENT');
    });
  });

  describe('cancel', () => {
    it('kills the process', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      // Mock process.kill for process group
      const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
      
      runner.cancel();
      
      expect(processKill).toHaveBeenCalledWith(-12345, 'SIGTERM');
      
      processKill.mockRestore();
    });

    it('does nothing if no process running', () => {
      const runner = new ScriptRunner();
      
      // Should not throw
      runner.cancel();
    });

    it('falls back to proc.kill if process.kill fails', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      
      // Mock process.kill to throw
      const processKill = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });
      
      runner.cancel();
      
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      
      processKill.mockRestore();
    });
  });

  describe('duration', () => {
    it('tracks duration while running', () => {
      const runner = new ScriptRunner();
      
      // Mock Date.now to control time
      const now = Date.now();
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(now) // Initial call in run()
        .mockReturnValueOnce(now + 1000); // Call to duration getter
      
      runner.run('npm test', '/project');
      
      expect(runner.duration).toBe(1000);
    });

    it('returns 0 before running', () => {
      const runner = new ScriptRunner();
      expect(runner.duration).toBe(0);
    });
  });

  describe('reset', () => {
    it('resets to idle state', () => {
      const runner = new ScriptRunner();
      runner.run('npm test', '/project');
      mockProcess.stdout.emit('data', Buffer.from('Output\n'));
      mockProcess.emit('exit', 0, null);
      
      runner.reset();
      
      expect(runner.status).toBe('idle');
      expect(runner.output).toEqual([]);
      expect(runner.duration).toBe(0);
    });
  });
});
