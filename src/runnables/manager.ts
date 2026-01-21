import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
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
  
  constructor(config: SpinConfig) {
    super();
    this.config = config;
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
      
      this.instances.set(id, {
        id,
        definition: {
          ...definition,
          name: definition.name || id,
        },
        status: 'stopped',
        process: null,
        stdout: [],
        stderr: [],
        output: [],
      });
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
    instance.stdout = [];
    instance.stderr = [];
    instance.output = [];
    instance.error = undefined;
    
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
      
      // Try graceful shutdown first
      proc.kill('SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        if (instance.process) {
          proc.kill('SIGKILL');
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
    
    const maxLines = this.config.defaults?.maxOutputLines ?? MAX_OUTPUT_LINES;
    
    // Add to respective stream
    if (stream === 'stdout') {
      instance.stdout.push(line);
      if (instance.stdout.length > maxLines) {
        instance.stdout.shift();
      }
    } else {
      instance.stderr.push(line);
      if (instance.stderr.length > maxLines) {
        instance.stderr.shift();
      }
    }
    
    // Add to combined output
    instance.output.push(line);
    if (instance.output.length > maxLines) {
      instance.output.shift();
    }
    
    // Emit event
    this.emit('output', id, line, stream);
    
    // Check readyWhen
    if (instance.status === 'starting' && instance.definition.readyWhen) {
      const allOutput = instance.output.join('\n');
      if (instance.definition.readyWhen(allOutput)) {
        this.setStatus(id, 'running');
      }
    }
  }
}
