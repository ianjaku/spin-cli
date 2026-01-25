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

// Strip ANSI escape codes from output for readyWhen detection
const stripAnsi = (str: string): string =>
  str.replace(/\x1b\[[0-9;]*m/g, '');

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
    
    // Check for ready condition or use a grace period
    if (definition.readyWhen) {
      // Will be marked as running when readyWhen returns true
      // (handled in addOutput)
    } else {
      // No readyWhen - use a grace period before marking as running
      // This allows fast-failing processes (like invalid docker images) to error
      // before dependents start
      const graceTimer = setTimeout(() => {
        // Only mark running if still in starting state (not errored)
        if (instance.status === 'starting') {
          this.setStatus(id, 'running');
        }
      }, 500);
      
      // Clean up timer if process exits before grace period
      proc.once('exit', () => clearTimeout(graceTimer));
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
   * Start all initialized runnables in dependency order.
   */
  async startAll(): Promise<void> {
    const order = this.getTopologicalOrder();

    // Start dependency watcher for recovery
    this.setupDependencyWatcher();

    for (const id of order) {
      // Don't await - let them run, waitForRunning handles ordering
      this.startWithDeps(id);
    }
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
      // Strip ANSI codes so users can match plain text like "Local:"
      if (instance.definition.readyWhen(stripAnsi(allOutput))) {
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
      // Strip ANSI codes so users can match plain text like "Local:"
      if (instance.definition.readyWhen(stripAnsi(allOutput))) {
        this.setStatus(id, 'running');
      }
    }, 50);

    this.readyCheckTimers.set(id, timer);
  }

  /**
   * Get runnables in topological order based on dependsOn.
   * Validates dependencies exist and detects cycles.
   */
  private getTopologicalOrder(): string[] {
    const ids = Array.from(this.instances.keys());

    // Validate all dependencies exist
    for (const id of ids) {
      const deps = this.instances.get(id)?.definition.dependsOn ?? [];
      for (const dep of deps) {
        if (!this.instances.has(dep)) {
          throw new Error(
            `Unknown dependency "${dep}" in runnable "${id}".\n\n` +
            `  dependsOn: ["${dep}"]  ← not found\n\n` +
            `Available runnables: ${ids.join(', ')}`
          );
        }
      }
    }

    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>(); // dependency -> dependents

    for (const id of ids) {
      inDegree.set(id, 0);
      graph.set(id, []);
    }

    for (const id of ids) {
      const deps = this.instances.get(id)?.definition.dependsOn ?? [];
      inDegree.set(id, deps.length);
      for (const dep of deps) {
        graph.get(dep)?.push(id);
      }
    }

    const queue = ids.filter(id => inDegree.get(id) === 0);
    const sorted: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const dependent of graph.get(current) ?? []) {
        const newDegree = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) queue.push(dependent);
      }
    }

    if (sorted.length !== ids.length) {
      const cycle = ids.filter(id => (inDegree.get(id) ?? 0) > 0);
      throw new Error(`Dependency cycle detected: ${cycle.join(', ')}`);
    }

    return sorted;
  }

  /**
   * Wait for a runnable to reach 'running' status.
   * Rejects if the runnable errors or stops.
   */
  private waitForRunning(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) return Promise.reject(new Error(`Unknown runnable: ${id}`));
    if (instance.status === 'running') return Promise.resolve();

    return new Promise((resolve, reject) => {
      const handler = (changedId: string, status: RunnableStatus) => {
        if (changedId !== id) return;
        if (status === 'running') {
          this.off('status-change', handler);
          resolve();
        } else if (status === 'error' || status === 'stopped') {
          this.off('status-change', handler);
          reject(new Error(`Dependency "${id}" failed to start`));
        }
      };
      this.on('status-change', handler);
    });
  }

  /**
   * Start a runnable, waiting for its dependencies first.
   */
  private async startWithDeps(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) return;

    const deps = instance.definition.dependsOn ?? [];
    if (deps.length === 0) {
      return this.start(id);
    }

    // Set waiting state with dependency list
    instance.waitingFor = [...deps];
    this.setStatus(id, 'waiting');

    try {
      await Promise.all(deps.map(dep => this.waitForRunning(dep)));
      instance.waitingFor = undefined;
      await this.start(id);
    } catch {
      // Dependency failed - stay in waiting state, watcher will retry
      // Don't clear waitingFor so UI can show which dep failed
    }
  }

  private dependencyWatcherSetup = false;

  /**
   * Set up a watcher to auto-start dependents when failed deps recover.
   */
  private setupDependencyWatcher(): void {
    if (this.dependencyWatcherSetup) return;
    this.dependencyWatcherSetup = true;

    // Watch for dependencies becoming running and retry waiting dependents
    this.on('status-change', (changedId, status) => {
      if (status !== 'running') return;

      // Find any instances waiting for this dependency
      for (const [id, instance] of this.instances) {
        if (instance.status === 'waiting' && instance.waitingFor?.includes(changedId)) {
          // Check if all deps are now running
          const allDepsRunning = instance.waitingFor.every(depId => {
            const dep = this.instances.get(depId);
            return dep?.status === 'running';
          });

          if (allDepsRunning) {
            instance.waitingFor = undefined;
            this.start(id);
          }
        }
      }
    });
  }
}
