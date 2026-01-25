/**
 * IPC state management for communication between spin TUI and MCP server
 * 
 * When spin TUI runs, it writes state to a file that the MCP server can read.
 * This allows `spin mcp` to get live status even when running as a separate process.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import type { RunnableStatus } from '../types.js';
import { findConfigRoot } from '../config/loader.js';

/**
 * State written by the spin TUI process
 */
export interface SpinState {
  /** Process ID of the spin TUI */
  pid: number;
  /** Path to the spin.config.ts file */
  configPath: string;
  /** Project root directory */
  projectRoot: string;
  /** When the state was last updated */
  updatedAt: string;
  /** Current status of each service */
  services: Record<string, {
    status: RunnableStatus;
    error?: string;
    startedAt?: string;
  }>;
  /** Recent log lines per service (last 100 lines) */
  logs: Record<string, string[]>;
}

/**
 * Get the state directory path
 */
export function getStateDir(): string {
  return join(homedir(), '.spin', 'state');
}

/**
 * Get a unique state file path for a project
 */
export function getStateFilePath(projectRoot: string): string {
  // Create a hash of the project path for a unique filename
  const hash = createHash('md5').update(projectRoot).digest('hex').slice(0, 12);
  return join(getStateDir(), `${hash}.json`);
}

/**
 * Ensure the state directory exists
 */
export function ensureStateDir(): void {
  const dir = getStateDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write spin state to the state file
 */
export function writeState(state: SpinState): void {
  ensureStateDir();
  const filePath = getStateFilePath(state.projectRoot);
  writeFileSync(filePath, JSON.stringify(state, null, 2));
}

/**
 * Read spin state from a state file
 */
export function readState(projectRoot: string): SpinState | null {
  const filePath = getStateFilePath(projectRoot);
  
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const state = JSON.parse(content) as SpinState;
    
    // Check if the process is still running
    if (!isProcessRunning(state.pid)) {
      // Process is dead, clean up stale state
      removeState(projectRoot);
      return null;
    }
    
    return state;
  } catch {
    return null;
  }
}

/**
 * Remove the state file (called when spin exits)
 */
export function removeState(projectRoot: string): void {
  const filePath = getStateFilePath(projectRoot);
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Check if a process is running by PID
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find state for the current directory by looking up the directory tree
 */
export function findStateForCurrentDir(): SpinState | null {
  // Use findConfigRoot to locate the project root
  const found = findConfigRoot();
  if (!found) {
    return null;
  }
  
  // Check if spin is running for this project
  const state = readState(found.projectRoot);
  return state;
}

/**
 * Find project root by looking for spin.config.ts
 */
export function findProjectRoot(): string | null {
  const found = findConfigRoot();
  return found ? found.projectRoot : null;
}
