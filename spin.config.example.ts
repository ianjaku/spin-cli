/**
 * Example spin configuration file.
 * Copy this to your project root as spin.config.ts and customize.
 */
import { defineConfig, shell, docker } from 'spin-cli';

export default defineConfig({
  runnables: {
    // Simple shell commands
    api: shell('npm run dev', {
      cwd: './packages/api',
      description: 'API server',
      readyWhen: (output) => output.includes('Listening on'),
    }),
    
    web: shell('npm run dev', {
      cwd: './apps/web',
      description: 'Web frontend',
    }),
    
    queue: shell('npm run dev', {
      cwd: './packages/queue',
      description: 'Job queue worker',
    }),
    
    // Docker containers
    postgres: docker('postgres:15', {
      description: 'PostgreSQL database',
      ports: ['5432:5432'],
      env: {
        POSTGRES_USER: 'dev',
        POSTGRES_PASSWORD: 'dev',
        POSTGRES_DB: 'app',
      },
    }),
    
    redis: docker('redis:7', {
      description: 'Redis cache',
      ports: ['6379:6379'],
    }),
  },
  
  groups: {
    // Common development setup
    dev: ['postgres', 'redis', 'api', 'web'],
    
    // Backend only
    backend: ['postgres', 'redis', 'api', 'queue'],
    
    // Infrastructure only
    infra: ['postgres', 'redis'],
  },
  
  defaults: {
    autoRestart: true,
    maxOutputLines: 500,
    env: {
      NODE_ENV: 'development',
    },
  },
});
