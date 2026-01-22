import React from 'react';
import { withFullScreen } from 'fullscreen-ink';
import { App } from './ui/App.js';
import { loadConfig, resolveTargets, createScriptRegistry } from './config/loader.js';
import { RunnableManager } from './runnables/manager.js';
import { defaultShellCommands } from './scripts/helpers.js';

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
  spin init                Create a spin.config.ts file

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
    await initCommand();
    return;
  }
  
  // Load config
  let config;
  try {
    config = await loadConfig();
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
  
  // Start the TUI
  const ink = withFullScreen(
    <App 
      manager={manager} 
      registry={registry}
      shellCommands={shellCommands}
    />
  );
  await ink.start();
  
  // Start all services
  await manager.startAll();
  
  // Wait until exit
  await ink.waitUntilExit();
  
  console.log('Goodbye!');
  process.exit(0);
}

async function listCommand() {
  let config;
  try {
    config = await loadConfig();
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

async function initCommand() {
  const { existsSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  
  const configPath = join(process.cwd(), 'spin.config.ts');
  
  if (existsSync(configPath)) {
    console.error('Error: spin.config.ts already exists');
    process.exit(1);
  }
  
  const template = `import { defineConfig, shell } from 'spin-cli';

export default defineConfig({
  runnables: {
    // Add your services here
    // api: shell('npm run dev', { cwd: './api', description: 'API server' }),
    // web: shell('npm run dev', { cwd: './web', description: 'Web frontend' }),
  },
  
  groups: {
    // dev: ['api', 'web'],
  },
});
`;
  
  writeFileSync(configPath, template);
  console.log('Created spin.config.ts');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
