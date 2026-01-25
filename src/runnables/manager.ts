import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { OutputBuffer } from './outputBuffer.js';
import type { 
  SpinConfig, 
  RunnableDefinition, 
  RunnableInstance, 
  RunnableStatus,
  OnReadyContext,
} from '../types.js';

const MAX_OUTPUT_LINES = 1000;

// Strip ANSI escape codes from output for readyWhen detection
const stripAnsi = (str: string): string =>
  str.replace(/\x1b\[[0-9;]*m/g, '');

interface ManagerEvents {
  'status-change': [id: string, status: RunnableStatus, error?: string];
  'output': [id: string, line: string, stream: 'stdout' | 'stderr'];
  'hidden-change': [id: string, hidden: boolean];
}

export class RunnableManager extends EventEmitter<ManagerEvents> {
  private instances: Map<string, RunnableInstance> = new Map();
  private config: SpinConfig;
  private outputBuffers: Map<string, { stdout: OutputBuffer; stderr: OutputBuffer; output: OutputBuffer }> = new Map();
  private maxOutputLines: number;
  private readyCheckTimers: Map<string, NodeJS.Timeout> = new Map();
  /** Runtime env vars set by onReady callbacks, keyed by runnable id */
  private runtimeEnv: Map<string, Record<string, string>> = new Map();
  /** Track which runnables have had their onReady invoked (once-only guard) */
  private onReadyCalled: Set<string> = new Set();
  
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
   * Get all hidden (sleeping) services.
   */
  getHiddenServices(): RunnableInstance[] {
    return Array.from(this.instances.values()).filter(i => i.hidden);
  }

  /**
   * Get all visible (non-hidden) services.
   */
  getVisibleServices(): RunnableInstance[] {
    return Array.from(this.instances.values()).filter(i => !i.hidden);
  }
  
  /**
   * Initialize runnables (creates instances but doesn't start them).
   * All instances start with hidden=true (sleeping state).
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
        hidden: true, // Start hidden (sleeping) by default
      } as RunnableInstance;

      this.instances.set(id, instance);
      this.outputBuffers.set(id, this.createOutputBuffers());
      this.attachOutputGetters(instance);
    }
  }
  
  /**
   * Start a runnable by ID.
   * Also unhides the service (makes it visible in UI).
   * @param additionalEnv Optional env vars inherited from dependencies' onReady callbacks
   */
  async start(id: string, additionalEnv?: Record<string, string>): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Unknown runnable: ${id}`);
    }
    
    // Unhide when starting (make visible in UI)
    this.setHidden(id, false);
    
    if (instance.status === 'running' || instance.status === 'starting') {
      return; // Already running
    }
    
    const { definition } = instance;
    
    if (!definition.command) {
      throw new Error(`Runnable "${id}" has no command`);
    }
    
    // Update status
    this.setStatus(id, 'starting');
    
    // Clear previous state (for restarts)
    this.clearOutputBuffers(id);
    this.runtimeEnv.delete(id);
    this.onReadyCalled.delete(id);
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
        ...additionalEnv, // Inherited runtime env from dependencies
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
      const graceTimer = setTimeout(async () => {
        // Only mark running if still in starting state (not errored)
        if (instance.status === 'starting') {
          await this.invokeOnReady(id);
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
   * Start a service along with any stopped dependencies.
   * For UI use when starting a sleeping service from the picker.
   * Unhides the service and all required dependencies, then starts them in order.
   */
  async startWithDependencies(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Unknown runnable: ${id}`);
    }

    // Get all transitive dependencies
    const allIds = this.getTransitiveDependencies([id]);
    
    // Find which ones need to be started (stopped or error state)
    const toStart = allIds.filter(depId => {
      const dep = this.instances.get(depId);
      return dep && dep.status !== 'running' && dep.status !== 'starting' && dep.status !== 'waiting';
    });

    // Unhide all services that will be started
    for (const depId of allIds) {
      this.setHidden(depId, false);
    }

    // If nothing to start, we're done
    if (toStart.length === 0) {
      return;
    }

    // Get topological order for the services that need starting
    const order = this.getTopologicalOrderFor(toStart);

    // Start dependency watcher for recovery
    this.setupDependencyWatcher();

    // Start each service with deps (handles waiting for dependencies)
    for (const depId of order) {
      const dep = this.instances.get(depId);
      if (dep && dep.status !== 'running' && dep.status !== 'starting' && dep.status !== 'waiting') {
        this.startWithDeps(depId);
      }
    }
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
   * Start runnables in dependency order.
   * If ids provided: start only those services (+ their transitive deps), unhiding them.
   * If ids omitted: start all initialized services.
   */
  async startAll(ids?: string[]): Promise<void> {
    let order: string[];

    if (ids && ids.length > 0) {
      // Get transitive deps and compute topo order for subset
      order = this.getTopologicalOrderFor(ids);
      
      // Unhide all services that will be started
      for (const id of order) {
        this.setHidden(id, false);
      }
    } else {
      // Start all - unhide everything
      order = this.getTopologicalOrder();
      for (const id of order) {
        this.setHidden(id, false);
      }
    }

    // Start dependency watcher for recovery
    this.setupDependencyWatcher();

    for (const id of order) {
      const instance = this.instances.get(id);
      // Skip if already running or starting
      if (instance?.status === 'running' || instance?.status === 'starting') {
        continue;
      }
      // Don't await - let them run, waitForRunning handles ordering
      this.startWithDeps(id);
    }
  }

  /**
   * Set the hidden state of a service and emit event.
   */
  private setHidden(id: string, hidden: boolean): void {
    const instance = this.instances.get(id);
    if (!instance || instance.hidden === hidden) return;
    
    instance.hidden = hidden;
    this.emit('hidden-change', id, hidden);
  }
  
  private setStatus(id: string, status: RunnableStatus, error?: string): void {
    const instance = this.instances.get(id);
    if (!instance) return;
    
    instance.status = status;
    instance.error = error;
    
    this.emit('status-change', id, status, error);
  }

  /**
   * Invoke the onReady callback for a runnable (once-only, best-effort).
   * Must be called before transitioning to 'running' status.
   */
  private async invokeOnReady(id: string): Promise<void> {
    // Once-only guard
    if (this.onReadyCalled.has(id)) return;
    this.onReadyCalled.add(id);

    const instance = this.instances.get(id);
    if (!instance?.definition.onReady) return;

    const context: OnReadyContext = {
      output: stripAnsi(this.getOutputLines(id, 'all', 500).join('\n')),
      setEnv: (key, value) => {
        const envMap = this.runtimeEnv.get(id) ?? {};
        envMap[key] = value;
        this.runtimeEnv.set(id, envMap);
      },
    };

    try {
      await instance.definition.onReady(context);
    } catch (err) {
      // Best-effort: log and continue, don't fail the runnable
      console.error(`[${id}] onReady error:`, err);
    }
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
        // Invoke onReady before transitioning (fire-and-forget, guarded)
        this.invokeOnReady(id).then(() => {
          this.setStatus(id, 'running');
        });
        return; // Don't continue synchronously
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
    return this.computeTopologicalOrder(ids);
  }

  /**
   * Compute topological order for a given set of IDs.
   * Used internally by both getTopologicalOrder and getTopologicalOrderFor.
   */
  private computeTopologicalOrder(ids: string[]): string[] {
    const idSet = new Set(ids);

    // Validate all dependencies exist in instances (not necessarily in the subset)
    for (const id of ids) {
      const deps = this.instances.get(id)?.definition.dependsOn ?? [];
      for (const dep of deps) {
        if (!this.instances.has(dep)) {
          throw new Error(
            `Unknown dependency "${dep}" in runnable "${id}".\n\n` +
            `  dependsOn: ["${dep}"]  ← not found\n\n` +
            `Available runnables: ${Array.from(this.instances.keys()).join(', ')}`
          );
        }
      }
    }

    // Kahn's algorithm for topological sort (only considering deps within the subset)
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>(); // dependency -> dependents

    for (const id of ids) {
      inDegree.set(id, 0);
      graph.set(id, []);
    }

    for (const id of ids) {
      const deps = this.instances.get(id)?.definition.dependsOn ?? [];
      // Only count dependencies that are in our subset
      const subsetDeps = deps.filter(dep => idSet.has(dep));
      inDegree.set(id, subsetDeps.length);
      for (const dep of subsetDeps) {
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
   * Get all transitive dependencies for the given IDs (including the IDs themselves).
   * Uses BFS to collect all dependencies recursively.
   */
  getTransitiveDependencies(ids: string[]): string[] {
    const visited = new Set<string>();
    const queue = [...ids];

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const deps = this.instances.get(id)?.definition.dependsOn ?? [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      }
    }

    return Array.from(visited);
  }

  /**
   * Get topological order for a subset of services (given IDs + their transitive deps).
   * Used by startAll(ids) to start only the relevant services in correct order.
   */
  getTopologicalOrderFor(ids: string[]): string[] {
    const allIds = this.getTransitiveDependencies(ids);
    return this.computeTopologicalOrder(allIds);
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
   * Collect runtime env vars from the given dependency IDs.
   */
  private collectEnvFromDependencies(deps: string[]): Record<string, string> {
    const inheritedEnv: Record<string, string> = {};
    for (const depId of deps) {
      const depEnv = this.runtimeEnv.get(depId);
      if (depEnv) {
        Object.assign(inheritedEnv, depEnv);
      }
    }
    return inheritedEnv;
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
      
      // Collect env vars from all dependencies
      const inheritedEnv = this.collectEnvFromDependencies(deps);
      
      await this.start(id, inheritedEnv);
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
            const deps = instance.waitingFor;
            instance.waitingFor = undefined;
            // Collect env vars from dependencies before starting
            const inheritedEnv = this.collectEnvFromDependencies(deps);
            this.start(id, inheritedEnv);
          }
        }
      }
    });
  }
}
