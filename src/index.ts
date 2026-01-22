/**
 * spin-cli
 * Beautiful interactive CLI for managing multiple dev services
 */

// Types
export type {
  SpinConfig,
  RunnableDefinition,
  RunnableInstance,
  RunnableStatus,
  ShellOptions,
  DockerOptions,
  // Script types
  ResolvedScript,
  ScriptSource,
  RunnerConfig,
  DockerRunnerConfig,
  KubernetesRunnerConfig,
  CustomRunnerConfig,
  ScriptsFolderOptions,
  PackageScriptsOptions,
} from './types.js';

// Config helpers
export { defineConfig } from './config/define.js';

// Runnable helpers
export { shell, docker } from './runnables/helpers.js';

// Script helpers
export { 
  packageScripts, 
  scriptsFolder,
  docker as dockerContext,
  kubernetes,
  defaultShellCommands,
} from './scripts/helpers.js';
