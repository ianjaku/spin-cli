import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

export type ScriptRunnerStatus = 'idle' | 'running' | 'success' | 'error';

interface RunnerEvents {
  'output': [line: string];
  'exit': [code: number | null, signal: string | null];
  'error': [error: Error];
}

/**
 * Runner for executing one-off scripts/commands.
 * Simpler than RunnableManager - runs one command at a time.
 */
export class ScriptRunner extends EventEmitter<RunnerEvents> {
  private process: ChildProcess | null = null;
  private _status: ScriptRunnerStatus = 'idle';
  private _output: string[] = [];
  private _startTime: number = 0;

  get status(): ScriptRunnerStatus {
    return this._status;
  }

  get output(): string[] {
    return this._output;
  }

  get duration(): number {
    if (this._startTime === 0) return 0;
    return Date.now() - this._startTime;
  }

  /**
   * Run a command in the specified working directory.
   */
  run(command: string, cwd: string): void {
    // Cancel any existing process
    if (this.process) {
      this.cancel();
    }

    this._status = 'running';
    this._output = [];
    this._startTime = Date.now();

    // Parse command - use shell for complex commands
    const proc = spawn(command, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process = proc;

    // Handle stdout
    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line) {
          this._output.push(line);
          this.emit('output', line);
        }
      }
    });

    // Handle stderr
    proc.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line) {
          this._output.push(line);
          this.emit('output', line);
        }
      }
    });

    // Handle exit
    proc.on('exit', (code, signal) => {
      this.process = null;
      this._status = code === 0 ? 'success' : 'error';
      this.emit('exit', code, signal);
    });

    // Handle error
    proc.on('error', (error) => {
      this.process = null;
      this._status = 'error';
      this.emit('error', error);
    });
  }

  /**
   * Cancel the currently running command.
   */
  cancel(): void {
    if (!this.process) return;

    try {
      // Try to kill the process group
      if (this.process.pid) {
        process.kill(-this.process.pid, 'SIGTERM');
      }
    } catch {
      // Fall back to killing just the process
      this.process.kill('SIGTERM');
    }

    // Force kill after timeout
    const proc = this.process;
    setTimeout(() => {
      if (proc && !proc.killed) {
        try {
          if (proc.pid) {
            process.kill(-proc.pid, 'SIGKILL');
          }
        } catch {
          proc.kill('SIGKILL');
        }
      }
    }, 2000);
  }

  /**
   * Check if a command is currently running.
   */
  isRunning(): boolean {
    return this._status === 'running';
  }

  /**
   * Reset the runner to idle state.
   */
  reset(): void {
    this._status = 'idle';
    this._output = [];
    this._startTime = 0;
  }
}
