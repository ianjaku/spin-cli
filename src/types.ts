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
  /** Captured stdout lines (snapshot) */
  stdout: string[];
  /** Captured stderr lines (snapshot) */
  stderr: string[];
  /** Combined output (stdout + stderr interleaved, snapshot) */
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
  /** Shell command prefixes that bypass search and run immediately */
  shellCommands?: string[];
  /** Script sources (packageScripts, scriptsFolder, etc.) */
  scripts?: ScriptSource[];
}

// ============================================================================
// Helper return types (for shell(), docker() helpers)
// ============================================================================

export type ShellOptions = Omit<RunnableDefinition, 'type' | 'command'>;
export type DockerOptions = Omit<RunnableDefinition, 'type' | 'command'> & {
  ports?: string[];
  volumes?: string[];
};

// ============================================================================
// Scripts
// ============================================================================

/** A resolved script ready to display in the palette and execute */
export interface ResolvedScript {
  /** Unique identifier */
  id: string;
  /** Display name shown in palette (e.g., "remix/migrate.ts") */
  displayName: string;
  /** Runner label shown on right side (e.g., "bun run", "docker (ops)") */
  runnerLabel: string;
  /** Full command to execute */
  command: string;
  /** Working directory to run in */
  cwd: string;
  /** Require confirmation before running */
  confirm?: boolean;
  /** Optional description */
  description?: string;
}

/** A script source that can resolve to multiple scripts */
export interface ScriptSource {
  /** Type of source for identification */
  type: 'packageScripts' | 'scriptsFolder';
  /** Resolve this source to concrete scripts */
  resolve(): Promise<ResolvedScript[]>;
}

/** Runner configuration for Docker execution */
export interface DockerRunnerConfig {
  type: 'docker';
  /** Container name or ID */
  container: string;
  /** Runner to use inside container (e.g., "bun run") */
  runner?: string;
}

/** Runner configuration for Kubernetes execution */
export interface KubernetesRunnerConfig {
  type: 'kubernetes';
  /** Pod selector (e.g., "app=api") */
  selector: string;
  /** Container name within the pod */
  container?: string;
  /** Namespace (defaults to "default") */
  namespace?: string;
  /** Runner to use inside container (e.g., "bun run") */
  runner?: string;
}

/** Custom runner function */
export interface CustomRunnerConfig {
  type: 'custom';
  /** Function that takes script path and returns full command */
  run: (scriptPath: string) => string;
}

/** Runner configuration - string (simple runner like "bun") or complex config */
export type RunnerConfig = string | DockerRunnerConfig | KubernetesRunnerConfig | CustomRunnerConfig;

/** Options for scriptsFolder() */
export interface ScriptsFolderOptions {
  /** Custom label for display (defaults to folder name) */
  label?: string;
  /** Override settings for specific scripts */
  overrides?: Record<string, {
    confirm?: boolean;
    description?: string;
  }>;
}

/** Options for packageScripts() */
export interface PackageScriptsOptions {
  /** Glob patterns to include (defaults to all package.json files) */
  include?: string[];
  /** Glob patterns to exclude */
  exclude?: string[];
}
