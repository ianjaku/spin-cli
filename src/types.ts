import type { ChildProcess } from 'node:child_process';

// ============================================================================
// Runnable Status
// ============================================================================

export type RunnableStatus = 'stopped' | 'starting' | 'running' | 'error';

// ============================================================================
// Runnable Definition (what users define in config)
// ============================================================================

export interface RunnableDefinition {
  /** The type of runnable */
  type: 'shell' | 'docker';
  /** Human-readable name (defaults to key) */
  name?: string;
  /** Description shown in UI */
  description?: string;
  /** Command to run (for shell type) */
  command?: string;
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Services this depends on (must be running first) */
  dependsOn?: string[];
  /** Function to determine if the service is ready */
  readyWhen?: (output: string) => boolean;
}

// ============================================================================
// Runnable Instance (runtime state)
// ============================================================================

export interface RunnableInstance {
  /** Unique identifier (key from config) */
  id: string;
  /** Definition from config */
  definition: RunnableDefinition;
  /** Current status */
  status: RunnableStatus;
  /** Child process (if running) */
  process: ChildProcess | null;
  /** Captured stdout lines */
  stdout: string[];
  /** Captured stderr lines */
  stderr: string[];
  /** Combined output (stdout + stderr interleaved) */
  output: string[];
  /** Error message (if status is 'error') */
  error?: string;
  /** Timestamp when started */
  startedAt?: Date;
}

// ============================================================================
// Config
// ============================================================================

export interface SpinConfig {
  /** Runnable definitions */
  runnables: Record<string, RunnableDefinition>;
  /** Named groups of runnables */
  groups?: Record<string, string[]>;
  /** Default settings */
  defaults?: {
    /** Auto-restart on crash */
    autoRestart?: boolean;
    /** Environment variables for all runnables */
    env?: Record<string, string>;
    /** Max lines to keep in output buffer */
    maxOutputLines?: number;
  };
}

// ============================================================================
// Helper return types (for shell(), docker() helpers)
// ============================================================================

export type ShellOptions = Omit<RunnableDefinition, 'type' | 'command'>;
export type DockerOptions = Omit<RunnableDefinition, 'type' | 'command'> & {
  ports?: string[];
  volumes?: string[];
};
