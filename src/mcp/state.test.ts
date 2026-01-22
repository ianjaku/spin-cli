import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getStateDir,
  getStateFilePath,
  ensureStateDir,
  writeState,
  readState,
  removeState,
  findProjectRoot,
  type SpinState,
} from './state.js';

// Create a temp directory for each test
let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = join(tmpdir(), `spin-state-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  originalCwd = process.cwd();
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

describe('getStateFilePath', () => {
  it('returns a path with hash of project root', () => {
    const path1 = getStateFilePath('/project/a');
    const path2 = getStateFilePath('/project/b');
    
    expect(path1).not.toBe(path2);
    expect(path1).toContain('.spin/state/');
    expect(path1).toMatch(/\.json$/);
  });

  it('returns consistent path for same project', () => {
    const path1 = getStateFilePath('/project/a');
    const path2 = getStateFilePath('/project/a');
    
    expect(path1).toBe(path2);
  });
});

describe('writeState/readState', () => {
  it('writes and reads state', () => {
    const state: SpinState = {
      pid: process.pid, // Use current process so it's "running"
      configPath: '/project/spin.config.ts',
      projectRoot: testDir,
      updatedAt: new Date().toISOString(),
      services: {
        api: { status: 'running', startedAt: new Date().toISOString() },
        web: { status: 'stopped' },
      },
      logs: {
        api: ['line 1', 'line 2'],
      },
    };

    writeState(state);
    const read = readState(testDir);

    expect(read).not.toBeNull();
    expect(read?.pid).toBe(process.pid);
    expect(read?.services.api.status).toBe('running');
    expect(read?.services.web.status).toBe('stopped');
    expect(read?.logs.api).toEqual(['line 1', 'line 2']);
  });

  it('returns null for non-existent state', () => {
    const read = readState('/non/existent/path');
    expect(read).toBeNull();
  });

  it('returns null and cleans up stale state from dead process', () => {
    const state: SpinState = {
      pid: 999999999, // Non-existent process
      configPath: '/project/spin.config.ts',
      projectRoot: testDir,
      updatedAt: new Date().toISOString(),
      services: {},
      logs: {},
    };

    writeState(state);
    const statePath = getStateFilePath(testDir);
    expect(existsSync(statePath)).toBe(true);

    // Reading should return null and clean up
    const read = readState(testDir);
    expect(read).toBeNull();
    expect(existsSync(statePath)).toBe(false);
  });
});

describe('removeState', () => {
  it('removes existing state file', () => {
    const state: SpinState = {
      pid: process.pid,
      configPath: '/project/spin.config.ts',
      projectRoot: testDir,
      updatedAt: new Date().toISOString(),
      services: {},
      logs: {},
    };

    writeState(state);
    const statePath = getStateFilePath(testDir);
    expect(existsSync(statePath)).toBe(true);

    removeState(testDir);
    expect(existsSync(statePath)).toBe(false);
  });

  it('does not throw for non-existent state', () => {
    expect(() => removeState('/non/existent/path')).not.toThrow();
  });
});

describe('findProjectRoot', () => {
  it('finds project root with spin.config.ts', () => {
    const projectDir = join(testDir, 'my-project');
    const subDir = join(projectDir, 'src', 'components');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(projectDir, 'spin.config.ts'), 'export default {}');

    process.chdir(subDir);
    const found = findProjectRoot();

    expect(found).toBe(projectDir);
  });

  it('returns null when no spin.config.ts found', () => {
    process.chdir(testDir);
    const found = findProjectRoot();

    expect(found).toBeNull();
  });
});
