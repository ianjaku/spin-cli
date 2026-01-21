import type { SpinConfig } from '../types.js';

/**
 * Define a spin configuration with full type safety.
 * 
 * @example
 * ```ts
 * import { defineConfig, shell } from 'spin-cli';
 * 
 * export default defineConfig({
 *   runnables: {
 *     api: shell('npm run dev', { cwd: './api' }),
 *     web: shell('npm run dev', { cwd: './web' }),
 *   },
 *   groups: {
 *     dev: ['api', 'web'],
 *   },
 * });
 * ```
 */
export function defineConfig(config: SpinConfig): SpinConfig {
  return config;
}
