import React from 'react';
import { withFullScreen } from 'fullscreen-ink';
import { App } from './ui/App.js';
import { loadConfig, resolveTargets, createScriptRegistry, findConfigRoot } from './config/loader.js';
import { RunnableManager } from './runnables/manager.js';
import { defaultShellCommands } from './scripts/helpers.js';
import { generateCliFileContent, getSpinVersion, ensureSpinFolder, getSpinFolderPath } from './spin-folder/index.js';
import { StateWriter, startMcpServer, autoInstallMcp, detectMcpTargets, getTargetDisplayName, isSpinMcpInstalled, installMcpServer } from './mcp/index.js';

async function main() {
  const args = process.argv.slice(2);
  
  // Handle --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
spin - Beautiful CLI for managing dev services

Usage:
  spin                     Open interactive mode (start all services)
  spin <services...>       Start specific services or groups
  spin list                List all services and groups
  spin init                Initialize spin in your project
  spin init --personal     Initialize for personal use (gitignored)
  spin mcp                 Start MCP server for AI assistants (stdio)
  spin mcp update          Update .spin folder and install MCP server
  spin mcp install         Install MCP server to detected AI tools
  spin mcp status          Show MCP installation status
  spin uninstall           Remove spin from your project
  spin uninstall --force   Remove without confirmation

Examples:
  spin                     Start all services
  spin api web             Start api and web services
  spin dev                 Start the "dev" group
  spin api queue web       Start multiple specific services

Options:
  -h, --help               Show this help message
  -v, --version            Show version
`);
    process.exit(0);
  }
  
  // Handle --version
  if (args.includes('--version') || args.includes('-v')) {
    console.log('spin v0.1.0');
    process.exit(0);
  }
  
  // Handle 'list' command
  if (args[0] === 'list') {
    await listCommand();
    return;
  }
  
  // Handle 'init' command
  if (args[0] === 'init') {
    const isPersonal = args.includes('--personal');
    const isForce = args.includes('--force');
    await initCommand({ personal: isPersonal, force: isForce });
    return;
  }
  
  // Handle 'mcp' command - start MCP server for AI assistants
  if (args[0] === 'mcp') {
    // Handle subcommands
    if (args[1] === 'update') {
      await mcpUpdateCommand();
      return;
    }
    if (args[1] === 'install') {
      await mcpInstallCommand();
      return;
    }
    if (args[1] === 'status') {
      await mcpStatusCommand();
      return;
    }
    // Default: start MCP server
    await startMcpServer();
    return;
  }
  
  // Handle 'uninstall' command
  if (args[0] === 'uninstall') {
    const isForce = args.includes('--force') || args.includes('-f');
    await uninstallCommand({ force: isForce });
    return;
  }
  
  // Load config (searches up the directory tree)
  let config;
  let projectRoot: string;
  try {
    const loaded = await loadConfig();
    config = loaded.config;
    projectRoot = loaded.projectRoot;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  
  // Determine which services to start
  let targets: string[];
  
  if (args.length === 0) {
    // No args = start all services
    targets = Object.keys(config.runnables);
  } else {
    // Resolve provided names
    const result = resolveTargets(args, config);
    
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.error(`Error: ${error}`);
      }
      process.exit(1);
    }
    
    targets = result.targets;
  }
  
  if (targets.length === 0) {
    console.error('No services to start');
    process.exit(1);
  }
  
  // Create manager and initialize services
  const manager = new RunnableManager(config);
  manager.init(targets);
  
  // Create script registry (lazy initialization on first palette open)
  const registry = createScriptRegistry(config);
  
  // Get shell commands from config or use defaults
  const shellCommands = config.shellCommands || defaultShellCommands;
  
  // Start the state writer (for MCP server to read)
  const { join } = await import('node:path');
  const configPath = join(projectRoot, 'spin.config.ts');
  const stateWriter = new StateWriter(manager, projectRoot, configPath);
  stateWriter.start();
  
  // Start the TUI
  const ink = withFullScreen(
    <App 
      manager={manager} 
      registry={registry}
      shellCommands={shellCommands}
    />,
    { exitOnCtrlC: false }
  );
  await ink.start();
  
  // Cleanup function to stop all processes before exiting
  let isCleaningUp = false;
  const cleanup = async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;
    
    stateWriter.stop();
    await manager.stopAll();
    ink.instance.unmount();
    console.log('Goodbye!');
    process.exit(0);
  };
  
  // Handle signals to ensure cleanup
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  // Start all services
  await manager.startAll();
  
  // Wait until exit
  await ink.waitUntilExit();
  
  // Cleanup when ink exits normally (e.g., pressing 'q')
  await cleanup();
}

async function listCommand() {
  let config;
  try {
    const loaded = await loadConfig();
    config = loaded.config;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  
  console.log('\nServices:');
  for (const [id, def] of Object.entries(config.runnables)) {
    const desc = def.description ? ` - ${def.description}` : '';
    console.log(`  ${id}${desc}`);
  }
  
  if (config.groups && Object.keys(config.groups).length > 0) {
    console.log('\nGroups:');
    for (const [name, services] of Object.entries(config.groups)) {
      console.log(`  ${name}: ${services.join(', ')}`);
    }
  }
  
  console.log('');
}

interface InitOptions {
  personal?: boolean;
  force?: boolean;
}

async function initCommand(options: InitOptions = {}) {
  const { existsSync, writeFileSync, mkdirSync, appendFileSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  
  const cwd = process.cwd();
  const spinFolder = join(cwd, '.spin');
  const configPath = join(cwd, 'spin.config.ts');
  const gitignorePath = join(cwd, '.gitignore');
  
  // Check if already initialized
  if (existsSync(configPath) && !options.force) {
    console.error('Error: spin.config.ts already exists. Use --force to overwrite.');
    process.exit(1);
  }
  
  // Create .spin folder
  if (!existsSync(spinFolder)) {
    mkdirSync(spinFolder, { recursive: true });
    console.log('Created .spin/');
  }
  
  // Generate .spin/cli.ts
  const cliContent = generateCliFileContent();
  writeFileSync(join(spinFolder, 'cli.ts'), cliContent);
  console.log('Created .spin/cli.ts');
  
  // Create .spin/.gitignore (for team adoption - ignores only cli.ts)
  if (!options.personal) {
    writeFileSync(join(spinFolder, '.gitignore'), 'cli.ts\n');
    console.log('Created .spin/.gitignore');
  }
  
  // Create spin.config.ts
  const configTemplate = `/**
 * Spin configuration
 * Run \`spin\` to start all services, or \`spin <service>\` to start specific ones.
 */
import { defineConfig, shell, docker } from './.spin/cli';

export default defineConfig({
  runnables: {
    // Example: shell command
    // api: shell('npm run dev', {
    //   cwd: './api',
    //   description: 'API server',
    //   readyWhen: (output) => output.includes('listening'),
    // }),
    
    // Example: Docker container
    // postgres: docker('postgres:15', {
    //   description: 'PostgreSQL database',
    //   ports: ['5432:5432'],
    //   env: { POSTGRES_PASSWORD: 'dev' },
    // }),
  },
  
  groups: {
    // dev: ['api', 'postgres'],
  },
});
`;
  
  writeFileSync(configPath, configTemplate);
  console.log('Created spin.config.ts');
  
  // Update .gitignore
  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    
    if (options.personal) {
      // Personal mode: ignore everything spin-related
      const additions: string[] = [];
      if (!gitignoreContent.includes('.spin/')) {
        additions.push('.spin/');
      }
      if (!gitignoreContent.includes('spin.config.ts')) {
        additions.push('spin.config.ts');
      }
      if (additions.length > 0) {
        appendFileSync(gitignorePath, '\n# spin (personal config)\n' + additions.join('\n') + '\n');
        console.log('Updated .gitignore (personal mode - config not tracked)');
      }
    } else {
      // Team mode: only ignore generated cli.ts
      if (!gitignoreContent.includes('.spin/cli.ts')) {
        appendFileSync(gitignorePath, '\n# spin CLI generated files\n.spin/cli.ts\n');
        console.log('Updated .gitignore');
      }
    }
  }
  
  // Auto-install MCP config for detected AI tools
  const mcpTargets = detectMcpTargets();
  if (mcpTargets.length > 0) {
    const installed = autoInstallMcp();
    if (installed.length > 0) {
      console.log('');
      console.log('MCP integration installed for:');
      for (const target of installed) {
        console.log(`  - ${getTargetDisplayName(target.type)}`);
      }
      console.log('AI assistants can now interact with your running services.');
    }
  }
  
  console.log('');
  if (options.personal) {
    console.log(`Done! (personal mode - spin config not committed to git)`);
    console.log('');
    console.log('Edit spin.config.ts to configure your services.');
    console.log('Run \`spin\` when ready to start.');
  } else {
    console.log('Done! Edit spin.config.ts to configure your services.');
    console.log('');
    console.log('Commit spin.config.ts to share with your team.');
    console.log('Team members just need to run \`spin\` - it auto-generates .spin/cli.ts');
  }
}

interface UninstallOptions {
  force?: boolean;
}

async function uninstallCommand(options: UninstallOptions = {}) {
  const { existsSync, rmSync, readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  
  // Find project root by traversing up
  const found = findConfigRoot();
  if (!found) {
    console.log('Nothing to uninstall. Could not find spin.config.ts (searched up to filesystem root).');
    return;
  }
  
  const { projectRoot } = found;
  const spinFolder = join(projectRoot, '.spin');
  const configPath = join(projectRoot, 'spin.config.ts');
  const gitignorePath = join(projectRoot, '.gitignore');
  
  // Check if there's anything to uninstall
  const hasSpinFolder = existsSync(spinFolder);
  const hasConfig = existsSync(configPath);
  
  // Get MCP functions and find installed targets
  const { isSpinMcpInstalled, uninstallMcpServer, getTargetDisplayName } = await import('./mcp/index.js');
  const installedMcpTargets = detectMcpTargets().filter(t => isSpinMcpInstalled(t));
  
  if (!hasSpinFolder && !hasConfig && installedMcpTargets.length === 0) {
    console.log('Nothing to uninstall. Spin is not initialized in this directory.');
    return;
  }
  
  // Show what will be removed
  console.log('\nThe following will be removed:');
  if (hasSpinFolder) {
    console.log('  - .spin/ folder');
  }
  if (hasConfig) {
    console.log('  - spin.config.ts');
  }
  for (const target of installedMcpTargets) {
    console.log(`  - MCP server config from ${getTargetDisplayName(target.type)}`);
  }
  console.log('');
  
  // Confirm unless --force
  if (!options.force) {
    const confirmed = await askConfirmation('Are you sure you want to uninstall spin? (y/N) ');
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
  }
  
  // Remove MCP server entries
  for (const target of installedMcpTargets) {
    try {
      uninstallMcpServer(target);
      console.log(`Removed MCP config from ${getTargetDisplayName(target.type)}`);
    } catch (error) {
      console.error(`Failed to remove MCP config from ${getTargetDisplayName(target.type)}: ${error}`);
    }
  }
  
  // Remove .spin folder
  if (hasSpinFolder) {
    try {
      rmSync(spinFolder, { recursive: true, force: true });
      console.log('Removed .spin/');
    } catch (error) {
      console.error(`Failed to remove .spin/: ${error}`);
    }
  }
  
  // Remove spin.config.ts
  if (hasConfig) {
    try {
      rmSync(configPath);
      console.log('Removed spin.config.ts');
    } catch (error) {
      console.error(`Failed to remove spin.config.ts: ${error}`);
    }
  }
  
  // Clean up .gitignore entries
  if (existsSync(gitignorePath)) {
    try {
      let gitignoreContent = readFileSync(gitignorePath, 'utf-8');
      const originalContent = gitignoreContent;
      
      // Remove spin-related entries
      gitignoreContent = gitignoreContent
        .replace(/\n# spin \(personal config\)\n\.spin\/\nspin\.config\.ts\n?/g, '')
        .replace(/\n# spin CLI generated files\n\.spin\/cli\.ts\n?/g, '')
        .replace(/\n# spin\n\.spin\/\n?/g, '');
      
      if (gitignoreContent !== originalContent) {
        writeFileSync(gitignorePath, gitignoreContent);
        console.log('Cleaned up .gitignore');
      }
    } catch (error) {
      // Ignore .gitignore cleanup errors
    }
  }
  
  console.log('');
  console.log('Spin has been uninstalled from this project.');
}

async function askConfirmation(prompt: string): Promise<boolean> {
  const { createInterface } = await import('node:readline');
  
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Update all files in .spin folder and install MCP server if not present
 */
async function mcpUpdateCommand() {
  const { existsSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  
  // Find project root by traversing up
  const found = findConfigRoot();
  if (!found) {
    console.error('Error: Could not find spin.config.ts (searched up to filesystem root).');
    console.error('Run `spin init` to initialize spin in your project.');
    process.exit(1);
  }
  
  const { projectRoot } = found;
  const spinFolder = getSpinFolderPath(projectRoot);
  const cliFilePath = join(spinFolder, 'cli.ts');
  const gitignorePath = join(spinFolder, '.gitignore');
  
  console.log(`Updating .spin folder (spin v${getSpinVersion()})...\n`);
  
  // Create .spin folder if it doesn't exist
  if (!existsSync(spinFolder)) {
    mkdirSync(spinFolder, { recursive: true });
    console.log('Created .spin/');
  }
  
  // Update .spin/cli.ts
  const cliContent = generateCliFileContent();
  writeFileSync(cliFilePath, cliContent);
  console.log('Updated .spin/cli.ts');
  
  // Ensure .spin/.gitignore exists
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, 'cli.ts\n');
    console.log('Created .spin/.gitignore');
  }
  
  // Install MCP server to detected AI tools
  const targets = detectMcpTargets();
  const installed: string[] = [];
  const alreadyInstalled: string[] = [];
  
  for (const target of targets) {
    if (isSpinMcpInstalled(target)) {
      alreadyInstalled.push(getTargetDisplayName(target.type));
    } else {
      try {
        installMcpServer(target);
        installed.push(getTargetDisplayName(target.type));
      } catch {
        // Skip targets that fail
      }
    }
  }
  
  console.log('');
  
  if (installed.length > 0) {
    console.log('MCP server installed for:');
    for (const name of installed) {
      console.log(`  + ${name}`);
    }
  }
  
  if (alreadyInstalled.length > 0) {
    console.log('MCP server already configured for:');
    for (const name of alreadyInstalled) {
      console.log(`  ✓ ${name}`);
    }
  }
  
  if (targets.length === 0) {
    console.log('No AI tools detected (Cursor, Claude Desktop).');
    console.log('MCP server config can be added manually if needed.');
  }
  
  console.log('');
  console.log('Done! Your .spin folder is up to date.');
}

/**
 * Install MCP server to all detected AI tools
 */
async function mcpInstallCommand() {
  const targets = detectMcpTargets();
  
  if (targets.length === 0) {
    console.log('No AI tools detected (Cursor, Claude Desktop).');
    console.log('');
    console.log('To manually configure MCP, add this to your tool\'s config:');
    console.log('');
    console.log('  "mcpServers": {');
    console.log('    "spin": {');
    console.log('      "command": "spin",');
    console.log('      "args": ["mcp"]');
    console.log('    }');
    console.log('  }');
    return;
  }
  
  const installed: string[] = [];
  const alreadyInstalled: string[] = [];
  
  for (const target of targets) {
    if (isSpinMcpInstalled(target)) {
      alreadyInstalled.push(getTargetDisplayName(target.type));
    } else {
      try {
        installMcpServer(target);
        installed.push(getTargetDisplayName(target.type));
      } catch {
        // Skip targets that fail
      }
    }
  }
  
  if (installed.length > 0) {
    console.log('MCP server installed for:');
    for (const name of installed) {
      console.log(`  + ${name}`);
    }
  }
  
  if (alreadyInstalled.length > 0) {
    console.log('MCP server already installed for:');
    for (const name of alreadyInstalled) {
      console.log(`  ✓ ${name}`);
    }
  }
  
  if (installed.length > 0) {
    console.log('');
    console.log('AI assistants can now interact with your spin services.');
  }
}

/**
 * Show MCP installation status
 */
async function mcpStatusCommand() {
  const version = getSpinVersion();
  console.log(`spin v${version} MCP Status\n`);
  
  const targets = detectMcpTargets();
  
  if (targets.length === 0) {
    console.log('No AI tools detected (Cursor, Claude Desktop).');
    return;
  }
  
  console.log('AI tool integrations:');
  for (const target of targets) {
    const installed = isSpinMcpInstalled(target);
    const status = installed ? '✓ installed' : '✗ not installed';
    console.log(`  ${getTargetDisplayName(target.type)}: ${status}`);
  }
  
  console.log('');
  console.log('Run `spin mcp install` to install missing integrations.');
  console.log('Run `spin mcp update` to update all .spin files and install MCP.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
