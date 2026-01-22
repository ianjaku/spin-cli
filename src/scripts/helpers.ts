import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import type {
  ScriptSource,
  ResolvedScript,
  RunnerConfig,
  ScriptsFolderOptions,
  PackageScriptsOptions,
  DockerRunnerConfig,
  KubernetesRunnerConfig,
} from '../types.js';

// ============================================================================
// Default Shell Commands
// ============================================================================

/** Default shell command prefixes that bypass search */
export const defaultShellCommands = [
  'git',
  'bun',
  'npm',
  'pnpm',
  'yarn',
  'node',
  'docker',
  'kubectl',
  'make',
];

// ============================================================================
// Package Manager Detection
// ============================================================================

type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';

const LOCKFILE_TO_PM: Record<string, PackageManager> = {
  'bun.lockb': 'bun',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
};

function detectPackageManager(cwd: string): PackageManager {
  for (const [lockfile, pm] of Object.entries(LOCKFILE_TO_PM)) {
    if (existsSync(join(cwd, lockfile))) {
      return pm;
    }
  }
  return 'npm'; // fallback
}

// ============================================================================
// Docker Runner
// ============================================================================

/** Create a Docker runner configuration */
export function docker(container: string, options?: { runner?: string }): DockerRunnerConfig {
  return {
    type: 'docker',
    container,
    runner: options?.runner,
  };
}

// ============================================================================
// Kubernetes Runner
// ============================================================================

/** Create a Kubernetes runner configuration */
export function kubernetes(options: {
  selector: string;
  container?: string;
  namespace?: string;
  runner?: string;
}): KubernetesRunnerConfig {
  return {
    type: 'kubernetes',
    ...options,
  };
}

// ============================================================================
// Generate Command from Runner Config
// ============================================================================

function generateCommand(
  scriptPath: string,
  runner: RunnerConfig,
  cwd: string
): { command: string; runnerLabel: string } {
  if (typeof runner === 'string') {
    // Simple string runner like "bun" or "bash"
    const fullPath = join(cwd, scriptPath);
    return {
      command: `${runner} run ${fullPath}`,
      runnerLabel: `${runner} run`,
    };
  }

  if (runner.type === 'docker') {
    const innerRunner = runner.runner || 'sh';
    return {
      command: `docker exec -it ${runner.container} ${innerRunner} ${scriptPath}`,
      runnerLabel: `docker (${runner.container})`,
    };
  }

  if (runner.type === 'kubernetes') {
    const ns = runner.namespace || 'default';
    const containerArg = runner.container ? `-c ${runner.container}` : '';
    const innerRunner = runner.runner || 'sh';
    // Note: actual pod selection would need kubectl get pods -l selector
    return {
      command: `kubectl exec -it -n ${ns} ${containerArg} $(kubectl get pods -n ${ns} -l ${runner.selector} -o jsonpath='{.items[0].metadata.name}') -- ${innerRunner} ${scriptPath}`,
      runnerLabel: `k8s (${runner.selector.split('=')[1] || runner.selector})`,
    };
  }

  if (runner.type === 'custom') {
    const fullPath = join(cwd, scriptPath);
    return {
      command: runner.run(fullPath),
      runnerLabel: 'custom',
    };
  }

  throw new Error(`Unknown runner type: ${JSON.stringify(runner)}`);
}

// ============================================================================
// scriptsFolder()
// ============================================================================

/** 
 * Create a script source that discovers scripts from a folder.
 * 
 * @example
 * ```ts
 * scriptsFolder("packages/remix/scripts", "bun")
 * scriptsFolder("ops/scripts", docker("ops-container"))
 * ```
 */
export function scriptsFolder(
  path: string,
  runner: RunnerConfig,
  options?: ScriptsFolderOptions
): ScriptSource {
  return {
    type: 'scriptsFolder',
    async resolve(): Promise<ResolvedScript[]> {
      const cwd = process.cwd();
      const fullPath = resolve(cwd, path);
      
      // Check if folder exists
      if (!existsSync(fullPath)) {
        console.warn(`[spin] Warning: scripts folder not found: ${path}`);
        return [];
      }

      const stat = statSync(fullPath);
      if (!stat.isDirectory()) {
        console.warn(`[spin] Warning: scripts path is not a directory: ${path}`);
        return [];
      }

      // Infer label from folder path
      const label = options?.label || inferLabel(path);

      // Scan for script files
      const scripts: ResolvedScript[] = [];
      const files = readdirSync(fullPath);

      for (const file of files) {
        const filePath = join(fullPath, file);
        const fileStat = statSync(filePath);
        
        if (!fileStat.isFile()) continue;
        
        // Only include common script extensions
        if (!isScriptFile(file)) continue;

        const relativePath = join(path, file);
        const { command, runnerLabel } = generateCommand(file, runner, fullPath);
        
        // Check for overrides
        const override = options?.overrides?.[file];

        scripts.push({
          id: `folder:${path}:${file}`,
          displayName: `${label}/${file}`,
          runnerLabel,
          command,
          cwd: fullPath,
          confirm: override?.confirm,
          description: override?.description,
        });
      }

      return scripts;
    },
  };
}

/** Infer a label from a folder path */
function inferLabel(path: string): string {
  // packages/remix/scripts -> remix
  // scripts -> scripts
  const parts = path.split('/').filter(Boolean);
  
  // If ends with "scripts", use parent folder name
  if (parts.length > 1 && parts[parts.length - 1] === 'scripts') {
    return parts[parts.length - 2];
  }
  
  return parts[parts.length - 1] || 'scripts';
}

/** Check if a file is a script file based on extension */
function isScriptFile(filename: string): boolean {
  const scriptExtensions = ['.ts', '.js', '.mjs', '.sh', '.py', '.rb'];
  return scriptExtensions.some(ext => filename.endsWith(ext));
}

// ============================================================================
// packageScripts()
// ============================================================================

/**
 * Create a script source that discovers npm/bun/pnpm scripts from package.json files.
 * 
 * @example
 * ```ts
 * packageScripts()
 * packageScripts({ include: [".", "packages/*"], exclude: ["packages/deprecated"] })
 * ```
 */
export function packageScripts(options?: PackageScriptsOptions): ScriptSource {
  return {
    type: 'packageScripts',
    async resolve(): Promise<ResolvedScript[]> {
      const cwd = process.cwd();
      const pm = detectPackageManager(cwd);
      const runCommand = `${pm} run`;

      const scripts: ResolvedScript[] = [];
      
      // Find package.json files
      const packageJsonPaths = findPackageJsonFiles(cwd, options);

      for (const pkgPath of packageJsonPaths) {
        try {
          const pkgContent = readFileSync(pkgPath, 'utf-8');
          const pkg = JSON.parse(pkgContent);
          
          if (!pkg.scripts || typeof pkg.scripts !== 'object') continue;

          const pkgDir = dirname(pkgPath);
          const relativePkgDir = pkgDir === cwd ? '.' : pkgDir.replace(cwd + '/', '');
          const isRoot = relativePkgDir === '.';
          
          // Get location label for non-root packages
          const locationLabel = isRoot ? '' : ` (${basename(relativePkgDir)})`;

          for (const [scriptName, scriptCommand] of Object.entries(pkg.scripts)) {
            if (typeof scriptCommand !== 'string') continue;

            scripts.push({
              id: `pkg:${relativePkgDir}:${scriptName}`,
              displayName: `${scriptName}${locationLabel}`,
              runnerLabel: runCommand,
              command: `${runCommand} ${scriptName}`,
              cwd: pkgDir,
            });
          }
        } catch (error) {
          console.warn(`[spin] Warning: Failed to parse ${pkgPath}: ${error}`);
        }
      }

      return scripts;
    },
  };
}

/** Find all package.json files based on include/exclude patterns */
function findPackageJsonFiles(cwd: string, options?: PackageScriptsOptions): string[] {
  const include = options?.include || ['.', '*', '*/'];
  const exclude = options?.exclude || [];
  
  const results: string[] = [];
  
  // Simple implementation - check root and immediate subdirectories
  // For more complex patterns, we'd use fast-glob
  
  // Check root
  const rootPkg = join(cwd, 'package.json');
  if (existsSync(rootPkg)) {
    results.push(rootPkg);
  }
  
  // Check subdirectories (one level deep for now)
  try {
    const entries = readdirSync(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      
      // Check if excluded
      if (exclude.some(pattern => matchesPattern(entry.name, pattern))) continue;
      
      const subPkg = join(cwd, entry.name, 'package.json');
      if (existsSync(subPkg)) {
        results.push(subPkg);
      }
      
      // Also check one more level (for monorepos like packages/*)
      try {
        const subEntries = readdirSync(join(cwd, entry.name), { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (!subEntry.isDirectory()) continue;
          if (subEntry.name.startsWith('.') || subEntry.name === 'node_modules') continue;
          
          const deepPkg = join(cwd, entry.name, subEntry.name, 'package.json');
          if (existsSync(deepPkg)) {
            results.push(deepPkg);
          }
        }
      } catch {
        // Ignore errors reading subdirectories
      }
    }
  } catch {
    // Ignore errors reading directory
  }
  
  return results;
}

/** Simple pattern matching for exclude patterns */
function matchesPattern(name: string, pattern: string): boolean {
  // Very simple matching - just check if pattern is contained or matches exactly
  if (pattern === name) return true;
  if (pattern.endsWith('*') && name.startsWith(pattern.slice(0, -1))) return true;
  if (pattern.includes('/') && name === pattern.split('/').pop()) return true;
  return false;
}
