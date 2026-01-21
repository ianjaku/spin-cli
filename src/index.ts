/**
 * spin-cli
 * Beautiful interactive CLI for managing multiple dev services
 */

export type {
  SpinConfig,
  RunnableDefinition,
  RunnableInstance,
  RunnableStatus,
  ShellOptions,
  DockerOptions,
} from './types.js';

export { defineConfig } from './config/define.js';
export { shell, docker } from './runnables/helpers.js';
