/**
 * Example spin configuration file.
 * Copy this to your project root as spin.config.ts and customize.
 */
import { defineConfig, shell, docker, packageScripts } from 'spin-cli';

export default defineConfig({
  scripts: [
    packageScripts(),
  ],
  runnables: {

    ngrok: shell("ngrok http 3000", {
      readyWhen: (output) => output.includes('Forwarding'),
      onReady: ({ output, setEnv }) => {
        const url = output.match(/https:\/\/[^\s]+\.ngrok\.io/)?.[0];
        if (!url) throw new Error('No ngrok URL found');
        setEnv('NGROK_URL', url);
      },
    }),

    // Docker containers
    postgres: docker('postgres:15', {
      ports: ['5432:5432'],
      env: {
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres',
        POSTGRES_DB: 'manual_to_plg',
      },
      volumes: ["data:/var/lib/postgresql/data"],
    }),
    
    next: shell("bun run dev", {
      cwd: "/home/ian/projects/manual/mtomanny/manny",
      readyWhen: (output) => output.includes('Ready'),
      dependsOn: ["postgres"]
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
