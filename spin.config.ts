/**
 * Example spin configuration file.
 * Copy this to your project root as spin.config.ts and customize.
 */
import { defineConfig, shell, docker } from 'spin-cli';

export default defineConfig({
  runnables: {

    next: shell("bun run dev", {
      cwd: "/home/ian/projects/manual/mtomanny/manny",
      description: 'Next.js server',
      readyWhen: (output) => output.includes('Ready'),
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
    



    // Simple shell commands
    api: shell('bun run dev', {
      // cwd: './packages/api',
      cwd: "/home/ian/projects/enfin/dashboarding/dashboarding",
      description: 'API server',
      readyWhen: (output) => output.includes('Ready'),
    }),




    
    web: shell('npm run dev', {
      cwd: './apps/web',
      description: 'Web frontend',
    }),
    
    queue: shell('npm run dev', {
      cwd: './packages/queue',
      description: 'Job queue worker',
    }),
    
    
    redis: docker('redis:7', {
      description: 'Redis cache',
      ports: ['6379:6379'],
    }),
  },
  
  groups: {
    // Common development setup
    // dev: ['postgres', 'redis', 'api', 'web'],
    dev: ["next", "postgres"],
    
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
