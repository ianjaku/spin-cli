import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MAX_HISTORY = 100;
const HISTORY_DIR = join(homedir(), '.spin');
const HISTORY_FILE = join(HISTORY_DIR, 'history');

/**
 * Manages command history with file persistence.
 * Stores in ~/.spin/history
 */
export class CommandHistory {
  private commands: string[] = [];
  private loaded = false;

  /**
   * Load history from file.
   */
  load(): void {
    if (this.loaded) return;

    try {
      if (existsSync(HISTORY_FILE)) {
        const content = readFileSync(HISTORY_FILE, 'utf-8');
        this.commands = content
          .split('\n')
          .filter(line => line.trim())
          .slice(-MAX_HISTORY);
      }
    } catch (error) {
      // Ignore errors reading history
      console.warn(`[spin] Warning: Could not load history: ${error}`);
    }

    this.loaded = true;
  }

  /**
   * Save history to file.
   */
  save(): void {
    try {
      // Ensure directory exists
      if (!existsSync(HISTORY_DIR)) {
        mkdirSync(HISTORY_DIR, { recursive: true });
      }

      writeFileSync(HISTORY_FILE, this.commands.join('\n') + '\n');
    } catch (error) {
      // Ignore errors saving history
      console.warn(`[spin] Warning: Could not save history: ${error}`);
    }
  }

  /**
   * Add a command to history.
   * Automatically deduplicates and saves.
   */
  add(command: string): void {
    const trimmed = command.trim();
    if (!trimmed) return;

    // Remove if already exists (move to end)
    const existingIndex = this.commands.indexOf(trimmed);
    if (existingIndex !== -1) {
      this.commands.splice(existingIndex, 1);
    }

    // Add to end
    this.commands.push(trimmed);

    // Trim to max size
    if (this.commands.length > MAX_HISTORY) {
      this.commands = this.commands.slice(-MAX_HISTORY);
    }

    // Save immediately
    this.save();
  }

  /**
   * Get all commands, newest first.
   */
  getAll(): string[] {
    return [...this.commands].reverse();
  }

  /**
   * Get command at index (0 = most recent).
   */
  get(index: number): string | undefined {
    const reversed = this.getAll();
    return reversed[index];
  }

  /**
   * Get the number of commands in history.
   */
  get length(): number {
    return this.commands.length;
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.commands = [];
    this.save();
  }
}
