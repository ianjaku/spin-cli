/**
 * PTY Process Spawner
 * 
 * Uses node-pty to spawn processes with a real pseudo-terminal,
 * and xterm-headless to parse TUI output into readable text.
 * 
 * This allows programs like ngrok that output TUI interfaces
 * to be displayed properly in the log viewer.
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

// Use createRequire for @xterm/headless due to ESM/CJS compatibility issues
const require = createRequire(import.meta.url);
const { Terminal } = require('@xterm/headless') as typeof import('@xterm/headless');

// Type alias for Terminal instance
type TerminalInstance = InstanceType<typeof Terminal>;

interface PtyProcessEvents {
  'output': [line: string];
  'screen-refresh': [lines: string[]]; // Replaces entire output (for TUI programs)
  'exit': [code: number];
  'error': [error: Error];
}

export interface PtyProcessOptions {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

/**
 * Extracts visible text from a terminal buffer, removing trailing whitespace
 * and empty lines at the end.
 */
function extractScreenContent(terminal: TerminalInstance): string[] {
  const lines: string[] = [];
  const buffer = terminal.buffer.active;
  
  for (let i = 0; i < terminal.rows; i++) {
    const line = buffer.getLine(i);
    if (line) {
      lines.push(line.translateToString(true)); // trim trailing whitespace
    }
  }
  
  // Also check scrollback buffer for any content that scrolled up
  const scrollback = buffer.baseY;
  if (scrollback > 0) {
    const scrollbackLines: string[] = [];
    for (let i = 0; i < scrollback; i++) {
      const line = buffer.getLine(i - scrollback);
      if (line) {
        scrollbackLines.push(line.translateToString(true));
      }
    }
    // Prepend scrollback content
    lines.unshift(...scrollbackLines);
  }
  
  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  
  return lines;
}

export class PtyProcess extends EventEmitter<PtyProcessEvents> {
  private ptyProcess: pty.IPty | null = null;
  private terminal: TerminalInstance;
  private lastScreenContent: string[] = [];
  private screenUpdateInterval: NodeJS.Timeout | null = null;
  private pid: number | null = null;
  
  constructor(private options: PtyProcessOptions) {
    super();
    
    // Create headless terminal for parsing TUI output
    this.terminal = new Terminal({
      cols: options.cols ?? 120,
      rows: options.rows ?? 40,
      scrollback: 1000,
      allowProposedApi: true, // Required to access buffer for screen extraction
    });
  }
  
  /**
   * Get the process ID
   */
  get processId(): number | null {
    return this.pid;
  }
  
  /**
   * Start the PTY process
   */
  start(): void {
    const { command, cwd, env } = this.options;
    
    // Parse command - for shell commands, use shell
    const shell = process.env.SHELL || '/bin/bash';
    
    try {
      this.ptyProcess = pty.spawn(shell, ['-c', command], {
        name: 'xterm-256color',
        cols: this.terminal.cols,
        rows: this.terminal.rows,
        cwd: cwd || process.cwd(),
        env: {
          ...process.env,
          ...env,
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
        } as Record<string, string>,
      });
      
      this.pid = this.ptyProcess.pid;
      
      // Feed PTY output to the headless terminal
      this.ptyProcess.onData((data) => {
        this.terminal.write(data);
      });
      
      // Handle process exit
      this.ptyProcess.onExit(({ exitCode }) => {
        this.stopScreenUpdates();
        // Final screen update
        this.emitScreenChanges();
        this.emit('exit', exitCode);
        this.ptyProcess = null;
      });
      
      // Start periodic screen content extraction
      this.startScreenUpdates();
      
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }
  
  /**
   * Start periodic screen updates
   */
  private startScreenUpdates(): void {
    // Check for screen changes every 100ms
    this.screenUpdateInterval = setInterval(() => {
      this.emitScreenChanges();
    }, 100);
  }
  
  /**
   * Stop screen updates
   */
  private stopScreenUpdates(): void {
    if (this.screenUpdateInterval) {
      clearInterval(this.screenUpdateInterval);
      this.screenUpdateInterval = null;
    }
  }
  
  /**
   * Extract current screen content and emit screen refresh event.
   * For TUI programs, we emit the entire screen content to replace (not append) output.
   */
  private emitScreenChanges(): void {
    const currentContent = extractScreenContent(this.terminal);
    
    // Check if screen content has changed
    const currentStr = currentContent.join('\n');
    const lastStr = this.lastScreenContent.join('\n');
    
    if (currentStr !== lastStr) {
      // Emit screen-refresh to replace all output
      this.emit('screen-refresh', currentContent);
      
      // Also emit individual output events for readyWhen detection
      // (only emit lines that are genuinely new)
      const lastSet = new Set(this.lastScreenContent.filter(l => l.trim()));
      for (const line of currentContent) {
        const trimmed = line.trim();
        if (trimmed && !lastSet.has(trimmed)) {
          this.emit('output', line);
        }
      }
      
      this.lastScreenContent = currentContent;
    }
  }
  
  /**
   * Get the current full screen content as a string
   */
  getScreenContent(): string {
    return extractScreenContent(this.terminal).join('\n');
  }
  
  /**
   * Get the current screen as lines
   */
  getScreenLines(): string[] {
    return extractScreenContent(this.terminal);
  }
  
  /**
   * Kill the process
   */
  kill(signal: string = 'SIGTERM'): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill(signal);
    }
  }
  
  /**
   * Write data to the process stdin
   */
  write(data: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }
  
  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
    this.terminal.resize(cols, rows);
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopScreenUpdates();
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
    this.terminal.dispose();
  }
}

/**
 * Spawn a process with PTY support
 */
export function spawnPty(options: PtyProcessOptions): PtyProcess {
  const proc = new PtyProcess(options);
  proc.start();
  return proc;
}
