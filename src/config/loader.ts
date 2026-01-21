import { createJiti } from 'jiti';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SpinConfig } from '../types.js';

const CONFIG_NAMES = [
  'spin.config.ts',
  'spin.config.js',
  'spin.config.mjs',
];

/**
 * Find and load the spin config file from the current directory.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<SpinConfig> {
  // Find config file
  let configPath: string | null = null;
  
  for (const name of CONFIG_NAMES) {
    const fullPath = join(cwd, name);
    if (existsSync(fullPath)) {
      configPath = fullPath;
      break;
    }
  }
  
  if (!configPath) {
    throw new Error(
      `Could not find spin config file. Create one of:\n` +
      CONFIG_NAMES.map(n => `  - ${n}`).join('\n')
    );
  }
  
  // Load config using jiti (handles TypeScript)
  const jiti = createJiti(import.meta.url, {
    // Resolve modules from the user's project
    moduleCache: false,
    fsCache: false,
  });
  
  try {
    const module = await jiti.import(configPath, { default: true });
    return module as SpinConfig;
  } catch (error) {
    throw new Error(
      `Failed to load config from ${configPath}:\n${error instanceof Error ? error.message : error}`
    );
  }
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
