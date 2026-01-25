/**
 * Ensures the .spin folder and cli.ts file exist before loading config.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateCliFileContent } from './generator.js';

const SPIN_FOLDER = '.spin';
const CLI_FILE = 'cli.ts';

/**
 * Ensure .spin/cli.ts exists and is up to date.
 * This is called before loading config to ensure imports resolve.
 * 
 * Only generates the file if:
 * 1. A spin.config.ts exists (user has initialized spin)
 * 2. The .spin folder exists OR config imports from ./.spin/cli
 * 
 * @param projectRoot - The project root directory (where spin.config.ts lives)
 * @param knownConfigPath - Optional: if already known, pass the config path to avoid re-searching
 */
export function ensureSpinFolder(projectRoot: string, knownConfigPath?: string): void {
  const spinFolder = join(projectRoot, SPIN_FOLDER);
  const cliFile = join(spinFolder, CLI_FILE);
  const configPath = knownConfigPath ?? findConfigFile(projectRoot);
  
  // No config file = nothing to do
  if (!configPath) {
    return;
  }
  
  // Check if config uses .spin/cli import
  const configContent = readFileSync(configPath, 'utf-8');
  const usesSpinFolder = configContent.includes('.spin/cli') || 
                         configContent.includes('./.spin/cli');
  
  // If .spin folder doesn't exist and config doesn't use it, skip
  if (!existsSync(spinFolder) && !usesSpinFolder) {
    return;
  }
  
  // Create .spin folder if needed
  if (!existsSync(spinFolder)) {
    mkdirSync(spinFolder, { recursive: true });
  }
  
  // Generate cli.ts content
  const cliContent = generateCliFileContent();
  
  // Only write if content changed (avoid unnecessary disk writes / IDE flicker)
  if (existsSync(cliFile)) {
    const existing = readFileSync(cliFile, 'utf-8');
    if (existing === cliContent) {
      return;
    }
  }
  
  writeFileSync(cliFile, cliContent);
}

/**
 * Find the config file in the given directory.
 */
function findConfigFile(cwd: string): string | null {
  const configNames = ['spin.config.ts', 'spin.config.js', 'spin.config.mjs'];
  
  for (const name of configNames) {
    const fullPath = join(cwd, name);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  
  return null;
}

/**
 * Check if the spin folder exists in the given directory.
 */
export function hasSpinFolder(cwd: string): boolean {
  return existsSync(join(cwd, SPIN_FOLDER));
}

/**
 * Get the path to the .spin folder.
 */
export function getSpinFolderPath(cwd: string): string {
  return join(cwd, SPIN_FOLDER);
}
