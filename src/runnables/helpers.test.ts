import { describe, it, expect } from 'vitest';
import { shell, docker } from './helpers.js';

describe('runnables/helpers', () => {
  describe('shell', () => {
    it('creates a shell runnable with just a command', () => {
      const runnable = shell('npm run dev');
      
      expect(runnable).toEqual({
        type: 'shell',
        command: 'npm run dev',
      });
    });

    it('creates a shell runnable with cwd option', () => {
      const runnable = shell('npm run dev', { cwd: './api' });
      
      expect(runnable).toEqual({
        type: 'shell',
        command: 'npm run dev',
        cwd: './api',
      });
    });

    it('creates a shell runnable with env option', () => {
      const runnable = shell('npm start', { 
        env: { PORT: '3000', NODE_ENV: 'development' } 
      });
      
      expect(runnable).toEqual({
        type: 'shell',
        command: 'npm start',
        env: { PORT: '3000', NODE_ENV: 'development' },
      });
    });

    it('creates a shell runnable with all options', () => {
      const readyWhen = (output: string) => output.includes('Ready');
      
      const runnable = shell('npm run dev', {
        name: 'API Server',
        cwd: './api',
        env: { PORT: '3000' },
        readyWhen,
      });
      
      expect(runnable.type).toBe('shell');
      expect(runnable.command).toBe('npm run dev');
      expect(runnable.name).toBe('API Server');
      expect(runnable.cwd).toBe('./api');
      expect(runnable.env).toEqual({ PORT: '3000' });
      expect(runnable.readyWhen).toBe(readyWhen);
    });
  });

  describe('docker', () => {
    it('creates a docker runnable with just an image', () => {
      const runnable = docker('postgres:15');
      
      expect(runnable.type).toBe('docker');
      expect(runnable.command).toBe('docker run --rm postgres:15');
    });

    it('creates a docker runnable with port mappings', () => {
      const runnable = docker('postgres:15', {
        ports: ['5432:5432'],
      });
      
      expect(runnable.command).toBe('docker run --rm -p 5432:5432 postgres:15');
    });

    it('creates a docker runnable with multiple port mappings', () => {
      const runnable = docker('app:latest', {
        ports: ['3000:3000', '3001:3001'],
      });
      
      expect(runnable.command).toBe('docker run --rm -p 3000:3000 -p 3001:3001 app:latest');
    });

    it('creates a docker runnable with volume mounts', () => {
      const runnable = docker('postgres:15', {
        volumes: ['./data:/var/lib/postgresql/data'],
      });
      
      expect(runnable.command).toBe('docker run --rm -v ./data:/var/lib/postgresql/data postgres:15');
    });

    it('creates a docker runnable with multiple volume mounts', () => {
      const runnable = docker('app:latest', {
        volumes: ['./src:/app/src', './config:/app/config'],
      });
      
      expect(runnable.command).toContain('-v ./src:/app/src');
      expect(runnable.command).toContain('-v ./config:/app/config');
    });

    it('creates a docker runnable with environment variables', () => {
      const runnable = docker('postgres:15', {
        env: { 
          POSTGRES_PASSWORD: 'dev',
          POSTGRES_USER: 'admin',
        },
      });
      
      expect(runnable.command).toContain('-e POSTGRES_PASSWORD=dev');
      expect(runnable.command).toContain('-e POSTGRES_USER=admin');
    });

    it('creates a docker runnable with all options', () => {
      const runnable = docker('postgres:15', {
        name: 'Database',
        ports: ['5432:5432'],
        volumes: ['./data:/var/lib/postgresql/data'],
        env: { POSTGRES_PASSWORD: 'dev' },
      });
      
      expect(runnable.type).toBe('docker');
      expect(runnable.name).toBe('Database');
      expect(runnable.command).toContain('docker run --rm');
      expect(runnable.command).toContain('-p 5432:5432');
      expect(runnable.command).toContain('-v ./data:/var/lib/postgresql/data');
      expect(runnable.command).toContain('-e POSTGRES_PASSWORD=dev');
      expect(runnable.command).toContain('postgres:15');
    });

    it('preserves option order: ports, volumes, env, image', () => {
      const runnable = docker('postgres:15', {
        ports: ['5432:5432'],
        volumes: ['./data:/data'],
        env: { PG_PASS: 'dev' },
      });
      
      // Verify the order is consistent
      const cmd = runnable.command!;
      const portIdx = cmd.indexOf('-p');
      const volumeIdx = cmd.indexOf('-v');
      const envIdx = cmd.indexOf('-e');
      const imageIdx = cmd.indexOf('postgres:15');
      
      expect(portIdx).toBeLessThan(volumeIdx);
      expect(volumeIdx).toBeLessThan(envIdx);
      expect(envIdx).toBeLessThan(imageIdx);
    });
  });
});
