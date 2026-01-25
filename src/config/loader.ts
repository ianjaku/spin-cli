import { createJiti } from 'jiti';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SpinConfig } from '../types.js';
import { ScriptRegistry } from '../scripts/registry.js';
import { ensureSpinFolder } from '../spin-folder/index.js';

const CONFIG_NAMES = [
  'spin.config.ts',
  'spin.config.js',
  'spin.config.mjs',
];

/**
 * Find the config file by traversing up the directory tree.
 * Returns the config path and project root, or null if not found.
 */
export function findConfigRoot(
  startDir: string = process.cwd()
): { configPath: string; projectRoot: string } | null {
  let dir = startDir;

  while (true) {
    for (const name of CONFIG_NAMES) {
      const fullPath = join(dir, name);
      if (existsSync(fullPath)) {
        return { configPath: fullPath, projectRoot: dir };
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break; // Reached filesystem root
    dir = parent;
  }

  return null;
}

/**
 * Find and load the spin config file by searching up the directory tree.
 * Returns both the config and the project root directory.
 */
export async function loadConfig(
  startDir: string = process.cwd()
): Promise<{ config: SpinConfig; projectRoot: string }> {
  // Find config file by traversing up the directory tree
  const found = findConfigRoot(startDir);
  
  if (!found) {
    throw new Error(
      `Could not find spin config file (searched from ${startDir} up to filesystem root).\n` +
      `Create one of:\n` +
      CONFIG_NAMES.map(n => `  - ${n}`).join('\n') +
      `\n\nOr run 'spin init' to create one.`
    );
  }
  
  const { configPath, projectRoot } = found;
  
  // Ensure .spin/cli.ts exists if the config uses it
  // This must happen BEFORE loading config so imports resolve
  ensureSpinFolder(projectRoot, configPath);
  
  // Load config using jiti (handles TypeScript)
  const jiti = createJiti(import.meta.url, {
    // Resolve modules from the user's project
    moduleCache: false,
    fsCache: false,
  });
  
  try {
    const module = await jiti.import(configPath, { default: true });
    return { config: module as SpinConfig, projectRoot };
  } catch (error) {
    throw new Error(
      `Failed to load config from ${configPath}:\n${error instanceof Error ? error.message : error}`
    );
  }
}

/**
 * Create a ScriptRegistry from the config's script sources.
 * The registry is created but not initialized - init() is called lazily.
 */
export function createScriptRegistry(config: SpinConfig): ScriptRegistry {
  return new ScriptRegistry(config.scripts || []);
}

/**
 * Resolve a list of names (services or groups) to service IDs.
 * Handles deduplication automatically.
 */
export function resolveTargets(
  names: string[],
  config: SpinConfig
): { targets: string[]; errors: string[] } {
  const targets = new Set<string>();
  const errors: string[] = [];
  
  for (const name of names) {
    // Check if it's a group
    if (config.groups?.[name]) {
      for (const serviceId of config.groups[name]) {
        if (config.runnables[serviceId]) {
          targets.add(serviceId);
        } else {
          errors.push(`Group "${name}" references unknown service "${serviceId}"`);
        }
      }
    }
    // Check if it's a service
    else if (config.runnables[name]) {
      targets.add(name);
    }
    // Unknown name - try fuzzy match
    else {
      const suggestion = findSimilar(name, [
        ...Object.keys(config.runnables),
        ...Object.keys(config.groups || {}),
      ]);
      
      if (suggestion) {
        errors.push(`Unknown target "${name}". Did you mean "${suggestion}"?`);
      } else {
        errors.push(`Unknown target "${name}"`);
      }
    }
  }
  
  return { targets: Array.from(targets), errors };
}

/**
 * Simple fuzzy matching - find similar strings.
 */
function findSimilar(input: string, candidates: string[]): string | null {
  const inputLower = input.toLowerCase();
  
  // Try prefix match first
  const prefixMatch = candidates.find(c => 
    c.toLowerCase().startsWith(inputLower) || 
    inputLower.startsWith(c.toLowerCase())
  );
  if (prefixMatch) return prefixMatch;
  
  // Try Levenshtein distance
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  
  for (const candidate of candidates) {
    const distance = levenshtein(inputLower, candidate.toLowerCase());
    if (distance < bestDistance && distance <= 3) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }
  
  return bestMatch;
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}
