import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CommandHistory } from './history.js';

// Mock fs functions
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

describe('CommandHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('add', () => {
    it('adds a command to history', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      const history = new CommandHistory();
      history.add('git status');
      
      expect(history.getAll()).toContain('git status');
    });

    it('ignores empty commands', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      const history = new CommandHistory();
      history.add('');
      history.add('   ');
      
      expect(history.length).toBe(0);
    });

    it('deduplicates commands (moves to end)', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      const history = new CommandHistory();
      history.add('git status');
      history.add('git commit');
      history.add('git status'); // duplicate
      
      expect(history.length).toBe(2);
      // getAll returns newest first
      expect(history.getAll()[0]).toBe('git status');
      expect(history.getAll()[1]).toBe('git commit');
    });

    it('trims to max 100 commands', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      const history = new CommandHistory();
      for (let i = 0; i < 110; i++) {
        history.add(`command ${i}`);
      }
      
      expect(history.length).toBe(100);
      // Should have commands 10-109 (oldest 10 trimmed)
      expect(history.get(0)).toBe('command 109');
      expect(history.get(99)).toBe('command 10');
    });

    it('saves after each add', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      const history = new CommandHistory();
      history.add('git status');
      
      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getAll', () => {
    it('returns commands in reverse order (newest first)', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      const history = new CommandHistory();
      history.add('first');
      history.add('second');
      history.add('third');
      
      const all = history.getAll();
      expect(all[0]).toBe('third');
      expect(all[1]).toBe('second');
      expect(all[2]).toBe('first');
    });

    it('returns empty array when no commands', () => {
      const history = new CommandHistory();
      expect(history.getAll()).toEqual([]);
    });
  });

  describe('get', () => {
    it('gets command by index (0 = most recent)', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      const history = new CommandHistory();
      history.add('first');
      history.add('second');
      history.add('third');
      
      expect(history.get(0)).toBe('third');
      expect(history.get(1)).toBe('second');
      expect(history.get(2)).toBe('first');
    });

    it('returns undefined for out of bounds index', () => {
      const history = new CommandHistory();
      expect(history.get(0)).toBeUndefined();
      expect(history.get(100)).toBeUndefined();
    });
  });

  describe('load', () => {
    it('loads history from file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('git status\ngit commit\ngit push\n');
      
      const history = new CommandHistory();
      history.load();
      
      expect(history.length).toBe(3);
      expect(history.getAll()).toContain('git status');
      expect(history.getAll()).toContain('git commit');
      expect(history.getAll()).toContain('git push');
    });

    it('handles missing history file', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      
      const history = new CommandHistory();
      history.load();
      
      expect(history.length).toBe(0);
    });

    it('only loads once', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('git status\n');
      
      const history = new CommandHistory();
      history.load();
      history.load();
      
      expect(readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('clears all commands', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      const history = new CommandHistory();
      history.add('git status');
      history.add('git commit');
      history.clear();
      
      expect(history.length).toBe(0);
      expect(history.getAll()).toEqual([]);
    });

    it('saves after clearing', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      const history = new CommandHistory();
      history.add('git status');
      vi.clearAllMocks();
      
      history.clear();
      
      expect(writeFileSync).toHaveBeenCalled();
    });
  });
});
