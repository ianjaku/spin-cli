import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { OutputBuffer } from './outputBuffer.js';
import type { 
  SpinConfig, 
  RunnableDefinition, 
  RunnableInstance, 
  RunnableStatus 
} from '../types.js';

const MAX_OUTPUT_LINES = 1000;

interface ManagerEvents {
  'status-change': [id: string, status: RunnableStatus, error?: string];
  'output': [id: string, line: string, stream: 'stdout' | 'stderr'];
}

export class RunnableManager extends EventEmitter<ManagerEvents> {
  private instances: Map<string, RunnableInstance> = new Map();
  private config: SpinConfig;
  private outputBuffers: Map<string, { stdout: OutputBuffer; stderr: OutputBuffer; output: OutputBuffer }> = new Map();
  private maxOutputLines: number;
  private readyCheckTimers: Map<string, NodeJS.Timeout> = new Map();
  
  constructor(config: SpinConfig) {
    super();
    this.config = config;
    this.maxOutputLines = this.config.defaults?.maxOutputLines ?? MAX_OUTPUT_LINES;
  }
  
  /**
   * Get all runnable instances.
   */
  getAll(): RunnableInstance[] {
    return Array.from(this.instances.values());
  }
  
  /**
   * Get a specific runnable instance.
   */
  get(id: string): RunnableInstance | undefined {
    return this.instances.get(id);
  }
  
  /**
   * Initialize runnables (creates instances but doesn't start them).
   */
  init(ids: string[]): void {
    for (const id of ids) {
      const definition = this.config.runnables[id];
      if (!definition) continue;
      
      const instance = {
        id,
        definition: {
          ...definition,
          name: definition.name || id,
        },
        status: 'stopped',
        process: null,
      } as RunnableInstance;

      this.instances.set(id, instance);
      this.outputBuffers.set(id, this.createOutputBuffers());
      this.attachOutputGetters(instance);
    }
  }
  
  /**
   * Start a runnable by ID.
   */
  async start(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Unknown runnable: ${id}`);
    }
    
    if (instance.status === 'running' || instance.status === 'starting') {
      return; // Already running
    }
    
    const { definition } = instance;
    
    if (!definition.command) {
      throw new Error(`Runnable "${id}" has no command`);
    }
    
    // Update status
    this.setStatus(id, 'starting');
    
    // Clear previous output
    this.clearOutputBuffers(id);
    instance.error = undefined;
    const existingTimer = this.readyCheckTimers.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.readyCheckTimers.delete(id);
    }
    
    // Spawn the process
    const [cmd, ...args] = definition.command.split(' ');
    
    const proc = spawn(cmd, args, {
      cwd: definition.cwd,
      env: {
        ...process.env,
        ...this.config.defaults?.env,
        ...definition.env,
        FORCE_COLOR: '1', // Preserve colors in output
      },
      shell: true,
      detached: true, // Create a new process group so we can kill the entire tree
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    instance.process = proc;
    instance.startedAt = new Date();
    
    // Handle stdout
    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        this.addOutput(id, line, 'stdout');
      }
    });
    
    // Handle stderr
    proc.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        this.addOutput(id, line, 'stderr');
      }
    });
    
    // Handle process exit
    proc.on('exit', (code, signal) => {
      instance.process = null;
      
      if (code === 0 || signal === 'SIGTERM' || signal === 'SIGINT') {
        this.setStatus(id, 'stopped');
      } else {
        this.setStatus(id, 'error', `Exited with code ${code}`);
      }
    });
    
    proc.on('error', (err) => {
      instance.process = null;
      this.setStatus(id, 'error', err.message);
    });
    
    // Check for ready condition or just mark as running
    if (definition.readyWhen) {
      // Will be marked as running when readyWhen returns true
      // (handled in addOutput)
    } else {
      // No readyWhen, mark as running immediately
      this.setStatus(id, 'running');
    }
  }
  
  /**
   * Stop a runnable by ID.
   */
  async stop(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance || !instance.process) {
      return;
    }
    
    return new Promise((resolve) => {
      const proc = instance.process!;
      
      proc.once('exit', () => {
        resolve();
      });
      
      // Kill the entire process group (negative PID) for graceful shutdown.
      // This ensures child processes spawned by the shell are also terminated.
      try {
        process.kill(-proc.pid!, 'SIGTERM');
      } catch {
        // Process group may not exist, fall back to killing just the process
        proc.kill('SIGTERM');
      }
      
      // Force kill after timeout
      setTimeout(() => {
        if (instance.process) {
          try {
            process.kill(-proc.pid!, 'SIGKILL');
          } catch {
            proc.kill('SIGKILL');
          }
        }
      }, 5000);
    });
  }
  
  /**
   * Restart a runnable by ID.
   */
  async restart(id: string): Promise<void> {
    await this.stop(id);
    await this.start(id);
  }
  
  /**
   * Stop all runnables.
   */
  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.instances.keys()).map(id => this.stop(id))
    );
  }
  
  /**
   * Start all initialized runnables.
   */
  async startAll(): Promise<void> {
    // TODO: Handle dependsOn ordering
    await Promise.all(
      Array.from(this.instances.keys()).map(id => this.start(id))
    );
  }
  
  private setStatus(id: string, status: RunnableStatus, error?: string): void {
    const instance = this.instances.get(id);
    if (!instance) return;
    
    instance.status = status;
    instance.error = error;
    
    this.emit('status-change', id, status, error);
  }
  
  private addOutput(id: string, line: string, stream: 'stdout' | 'stderr'): void {
    const instance = this.instances.get(id);
    if (!instance) return;
    
    const buffers = this.outputBuffers.get(id);
    if (!buffers) return;
    
    // Add to respective stream
    if (stream === 'stdout') {
      buffers.stdout.push(line);
    } else {
      buffers.stderr.push(line);
    }
    
    // Add to combined output
    buffers.output.push(line);
    
    // Emit event
    this.emit('output', id, line, stream);
    
    // Check readyWhen immediately after new output
    if (instance.status === 'starting' && instance.definition.readyWhen) {
      const allOutput = this.getOutputLines(id, 'all').join('\n');
      if (instance.definition.readyWhen(allOutput)) {
        this.setStatus(id, 'running');
      }
    }
  }

  getOutputLines(
    id: string,
    stream: 'stdout' | 'stderr' | 'all' = 'all',
    limit?: number
  ): string[] {
    const buffers = this.outputBuffers.get(id);
    if (!buffers) return [];

    const buffer = stream === 'stdout'
      ? buffers.stdout
      : stream === 'stderr'
        ? buffers.stderr
        : buffers.output;

    if (typeof limit === 'number') {
      return buffer.tail(limit);
    }

    return buffer.toArray();
  }

  getOutputLength(id: string, stream: 'stdout' | 'stderr' | 'all' = 'all'): number {
    const buffers = this.outputBuffers.get(id);
    if (!buffers) return 0;

    if (stream === 'stdout') return buffers.stdout.length;
    if (stream === 'stderr') return buffers.stderr.length;
    return buffers.output.length;
  }

  private createOutputBuffers(): { stdout: OutputBuffer; stderr: OutputBuffer; output: OutputBuffer } {
    return {
      stdout: new OutputBuffer(this.maxOutputLines),
      stderr: new OutputBuffer(this.maxOutputLines),
      output: new OutputBuffer(this.maxOutputLines),
    };
  }

  private clearOutputBuffers(id: string): void {
    const buffers = this.outputBuffers.get(id);
    if (!buffers) return;
    buffers.stdout.clear();
    buffers.stderr.clear();
    buffers.output.clear();
  }

  private attachOutputGetters(instance: RunnableInstance): void {
    const id = instance.id;
    Object.defineProperties(instance, {
      stdout: {
        enumerable: true,
        get: () => this.getOutputLines(id, 'stdout'),
      },
      stderr: {
        enumerable: true,
        get: () => this.getOutputLines(id, 'stderr'),
      },
      output: {
        enumerable: true,
        get: () => this.getOutputLines(id, 'all'),
      },
    });
  }

  private scheduleReadyCheck(id: string): void {
    if (this.readyCheckTimers.has(id)) return;

    const timer = setTimeout(() => {
      this.readyCheckTimers.delete(id);
      const instance = this.instances.get(id);
      if (!instance || instance.status !== 'starting' || !instance.definition.readyWhen) {
        return;
      }

      const allOutput = this.getOutputLines(id, 'all').join('\n');
      if (instance.definition.readyWhen(allOutput)) {
        this.setStatus(id, 'running');
      }
    }, 50);

    this.readyCheckTimers.set(id, timer);
  }
}
