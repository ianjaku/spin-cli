/**
 * State writer for the spin TUI process
 * 
 * Keeps the state file updated so `spin mcp` can read live status.
 */
import type { RunnableManager } from '../runnables/manager.js';
import { writeState, removeState, type SpinState } from './state.js';

const MAX_LOG_LINES = 100;

/**
 * Manages writing state from the spin TUI to a file for MCP to read
 */
export class StateWriter {
  private manager: RunnableManager;
  private projectRoot: string;
  private configPath: string;
  private logs: Map<string, string[]> = new Map();
  private cleanupHandlers: (() => void)[] = [];

  constructor(manager: RunnableManager, projectRoot: string, configPath: string) {
    this.manager = manager;
    this.projectRoot = projectRoot;
    this.configPath = configPath;
    this.setupListeners();
  }

  private setupListeners(): void {
    // Listen for status changes
    const statusHandler = () => {
      this.writeCurrentState();
    };
    this.manager.on('status-change', statusHandler);
    this.cleanupHandlers.push(() => this.manager.off('status-change', statusHandler));

    // Listen for output
    const outputHandler = (id: string, line: string) => {
      let serviceLines = this.logs.get(id);
      if (!serviceLines) {
        serviceLines = [];
        this.logs.set(id, serviceLines);
      }
      serviceLines.push(line);
      if (serviceLines.length > MAX_LOG_LINES) {
        serviceLines.shift();
      }
      // Don't write state on every line - too noisy
      // State is written on status changes and periodically
    };
    this.manager.on('output', outputHandler);
    this.cleanupHandlers.push(() => this.manager.off('output', outputHandler));
  }

  /**
   * Write the current state to the state file
   */
  writeCurrentState(): void {
    const instances = this.manager.getAll();
    const services: SpinState['services'] = {};

    for (const instance of instances) {
      services[instance.id] = {
        status: instance.status,
        error: instance.error,
        startedAt: instance.startedAt?.toISOString(),
      };
      
      // Update logs from instance
      const recentOutput = this.manager.getOutputLines(instance.id, 'all', MAX_LOG_LINES);
      if (recentOutput.length > 0) {
        this.logs.set(instance.id, recentOutput);
      }
    }

    const state: SpinState = {
      pid: process.pid,
      configPath: this.configPath,
      projectRoot: this.projectRoot,
      updatedAt: new Date().toISOString(),
      services,
      logs: Object.fromEntries(this.logs),
    };

    writeState(state);
  }

  /**
   * Start the state writer (write initial state)
   */
  start(): void {
    this.writeCurrentState();
  }

  /**
   * Stop the state writer and clean up
   */
  stop(): void {
    // Remove event listeners
    for (const cleanup of this.cleanupHandlers) {
      cleanup();
    }
    this.cleanupHandlers = [];

    // Remove the state file
    removeState(this.projectRoot);
  }
}
