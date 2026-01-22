import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandPalette } from './CommandPalette.js';
import type { ResolvedScript } from '../types.js';

// Helper to create mock scripts
function createMockScript(overrides: Partial<ResolvedScript> = {}): ResolvedScript {
  return {
    id: 'test-script',
    displayName: 'test/script.ts',
    runnerLabel: 'bun run',
    command: 'bun run test/script.ts',
    cwd: '/test',
    ...overrides,
  };
}

// Helper to wait for React effects to run
const wait = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

describe('CommandPalette', () => {
  const defaultProps = {
    scripts: [] as ResolvedScript[],
    shellCommands: ['git', 'npm', 'bun'],
    history: [] as string[],
    cwd: '/project',
    width: 80,
    height: 24,
    onRun: vi.fn(),
    onClose: vi.fn(),
    onSearch: vi.fn(() => []),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the palette header', () => {
      const { lastFrame } = render(<CommandPalette {...defaultProps} />);
      
      expect(lastFrame()).toContain('Run');
    });

    it('renders the input cursor', () => {
      const { lastFrame } = render(<CommandPalette {...defaultProps} />);
      
      expect(lastFrame()).toContain('>');
      expect(lastFrame()).toContain('█');
    });

    it('renders keyboard shortcuts in footer', () => {
      const { lastFrame } = render(<CommandPalette {...defaultProps} />);
      
      expect(lastFrame()).toContain('Enter:run');
      expect(lastFrame()).toContain('Tab:fill');
      expect(lastFrame()).toContain('Esc:close');
    });

    it('shows "No scripts configured" when empty', () => {
      const { lastFrame } = render(
        <CommandPalette {...defaultProps} scripts={[]} />
      );
      
      expect(lastFrame()).toContain('No scripts configured');
    });

    it('shows scripts when provided', () => {
      const scripts = [
        createMockScript({ id: 's1', displayName: 'migrate.ts', runnerLabel: 'bun run' }),
        createMockScript({ id: 's2', displayName: 'deploy.sh', runnerLabel: 'bash' }),
      ];
      
      const { lastFrame } = render(
        <CommandPalette 
          {...defaultProps} 
          scripts={scripts}
          onSearch={() => scripts}
        />
      );
      
      expect(lastFrame()).toContain('migrate.ts');
      expect(lastFrame()).toContain('deploy.sh');
      expect(lastFrame()).toContain('bun run');
      expect(lastFrame()).toContain('bash');
    });

    it('shows selection indicator on first item', () => {
      const scripts = [
        createMockScript({ id: 's1', displayName: 'first.ts' }),
        createMockScript({ id: 's2', displayName: 'second.ts' }),
      ];
      
      const { lastFrame } = render(
        <CommandPalette 
          {...defaultProps} 
          scripts={scripts}
          onSearch={() => scripts}
        />
      );
      
      expect(lastFrame()).toContain('▸');
    });
  });

  describe('input handling', () => {
    it('updates input when typing', async () => {
      const { lastFrame, stdin } = render(<CommandPalette {...defaultProps} />);
      
      // Wait for useEffect to register the input handler
      await wait();
      
      stdin.write('h');
      await wait();
      stdin.write('e');
      await wait();
      stdin.write('l');
      await wait();
      stdin.write('l');
      await wait();
      stdin.write('o');
      await wait();
      
      expect(lastFrame()).toContain('hello');
    });

    it('handles backspace', async () => {
      const { lastFrame, stdin } = render(<CommandPalette {...defaultProps} />);
      
      await wait();
      stdin.write('h');
      await wait();
      stdin.write('e');
      await wait();
      stdin.write('l');
      await wait();
      stdin.write('l');
      await wait();
      stdin.write('o');
      await wait();
      stdin.write('\x7f'); // backspace
      await wait();
      
      expect(lastFrame()).toContain('hell');
    });

    it('calls onSearch when typing', async () => {
      const onSearch = vi.fn(() => []);
      const { stdin } = render(
        <CommandPalette {...defaultProps} onSearch={onSearch} />
      );
      
      await wait();
      stdin.write('m');
      await wait();
      
      expect(onSearch).toHaveBeenCalled();
    });
  });

  describe('search results', () => {
    it('shows filtered results based on search', async () => {
      const scripts = [
        createMockScript({ id: 's1', displayName: 'migrate.ts' }),
        createMockScript({ id: 's2', displayName: 'deploy.sh' }),
      ];
      
      const onSearch = vi.fn((query: string) => {
        if (query.includes('mig')) {
          return [scripts[0]];
        }
        return scripts;
      });
      
      const { lastFrame, stdin } = render(
        <CommandPalette 
          {...defaultProps} 
          scripts={scripts}
          onSearch={onSearch}
        />
      );
      
      await wait();
      stdin.write('mig');
      await wait();
      
      expect(lastFrame()).toContain('migrate.ts');
    });

    it('shows "no matches" message when search has no results', async () => {
      const onSearch = vi.fn(() => []);
      
      const { lastFrame, stdin } = render(
        <CommandPalette {...defaultProps} onSearch={onSearch} />
      );
      
      await wait();
      stdin.write('zzz');
      await wait();
      
      expect(lastFrame()).toContain('no matches');
    });
  });

  describe('shell command bypass', () => {
    it('shows shell command message for configured prefixes', async () => {
      const { lastFrame, stdin } = render(
        <CommandPalette 
          {...defaultProps} 
          shellCommands={['git', 'npm']}
        />
      );
      
      await wait();
      stdin.write('git status');
      await wait();
      
      expect(lastFrame()).toContain('will run as shell command');
    });

    it('shows shell command message for ! prefix', async () => {
      const { lastFrame, stdin } = render(<CommandPalette {...defaultProps} />);
      
      await wait();
      stdin.write('!some-command');
      await wait();
      
      expect(lastFrame()).toContain('will run as shell command');
    });

    it('does not show shell command message for normal search', async () => {
      const scripts = [createMockScript({ displayName: 'migrate.ts' })];
      
      const { lastFrame, stdin } = render(
        <CommandPalette 
          {...defaultProps} 
          scripts={scripts}
          onSearch={() => scripts}
        />
      );
      
      await wait();
      stdin.write('mig');
      await wait();
      
      expect(lastFrame()).not.toContain('will run as shell command');
    });
  });

  describe('keyboard navigation', () => {
    it('calls onClose on Escape', async () => {
      const onClose = vi.fn();
      const { stdin } = render(
        <CommandPalette {...defaultProps} onClose={onClose} />
      );
      
      await wait();
      stdin.write('\x1b'); // Escape
      await wait();
      
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onRun on Enter with shell command', async () => {
      const onRun = vi.fn();
      const { stdin } = render(
        <CommandPalette 
          {...defaultProps} 
          onRun={onRun}
          shellCommands={['git']}
        />
      );
      
      await wait();
      stdin.write('git status');
      await wait();
      stdin.write('\r'); // Enter
      await wait();
      
      expect(onRun).toHaveBeenCalledWith('git status', '/project');
    });

    it('calls onRun on Enter with selected script', async () => {
      const onRun = vi.fn();
      const scripts = [
        createMockScript({ 
          id: 's1', 
          displayName: 'migrate.ts',
          command: 'bun run migrate.ts',
          cwd: '/scripts',
        }),
      ];
      
      const { stdin } = render(
        <CommandPalette 
          {...defaultProps} 
          scripts={scripts}
          onSearch={() => scripts}
          onRun={onRun}
        />
      );
      
      await wait();
      stdin.write('\r'); // Enter (select first script)
      await wait();
      
      expect(onRun).toHaveBeenCalledWith('bun run migrate.ts', '/scripts');
    });

    it('strips ! prefix when running', async () => {
      const onRun = vi.fn();
      const { stdin } = render(
        <CommandPalette {...defaultProps} onRun={onRun} />
      );
      
      await wait();
      stdin.write('!custom-command');
      await wait();
      stdin.write('\r'); // Enter
      await wait();
      
      expect(onRun).toHaveBeenCalledWith('custom-command', '/project');
    });

    it('runs input as shell command when no matches', async () => {
      const onRun = vi.fn();
      const onSearch = vi.fn(() => []);
      
      const { stdin } = render(
        <CommandPalette 
          {...defaultProps} 
          onRun={onRun}
          onSearch={onSearch}
        />
      );
      
      await wait();
      stdin.write('unknown-command');
      await wait();
      stdin.write('\r'); // Enter
      await wait();
      
      expect(onRun).toHaveBeenCalledWith('unknown-command', '/project');
    });
  });

  describe('history navigation', () => {
    it('cycles through history on up arrow when input is empty', async () => {
      const history = ['git status', 'npm run build', 'bun test'];
      const { lastFrame, stdin } = render(
        <CommandPalette {...defaultProps} history={history} />
      );
      
      await wait();
      stdin.write('\x1b[A'); // Up arrow
      await wait();
      
      expect(lastFrame()).toContain('git status');
    });

    it('cycles back through history on down arrow', async () => {
      const history = ['git status', 'npm run build'];
      const { lastFrame, stdin } = render(
        <CommandPalette {...defaultProps} history={history} />
      );
      
      await wait();
      // Go up twice
      stdin.write('\x1b[A'); // Up arrow
      await wait();
      stdin.write('\x1b[A'); // Up arrow
      await wait();
      
      // Should show second history item
      expect(lastFrame()).toContain('npm run build');
      
      // Go back down
      stdin.write('\x1b[B'); // Down arrow
      await wait();
      
      expect(lastFrame()).toContain('git status');
    });
  });

  describe('tab completion', () => {
    it('autofills selected script command on Tab', async () => {
      const scripts = [
        createMockScript({ 
          id: 's1', 
          displayName: 'migrate.ts',
          command: 'bun run /full/path/migrate.ts',
        }),
      ];
      
      const { lastFrame, stdin } = render(
        <CommandPalette 
          {...defaultProps} 
          scripts={scripts}
          onSearch={() => scripts}
        />
      );
      
      await wait();
      stdin.write('\t'); // Tab
      await wait();
      
      expect(lastFrame()).toContain('bun run /full/path/migrate.ts');
    });
  });

  describe('confirmation dialog', () => {
    it('shows confirmation for scripts with confirm: true', async () => {
      const scripts = [
        createMockScript({ 
          id: 's1', 
          displayName: 'dangerous.ts',
          confirm: true,
        }),
      ];
      
      const { lastFrame, stdin } = render(
        <CommandPalette 
          {...defaultProps} 
          scripts={scripts}
          onSearch={() => scripts}
        />
      );
      
      await wait();
      stdin.write('\r'); // Enter to select
      await wait();
      
      expect(lastFrame()).toContain('Confirm');
      expect(lastFrame()).toContain('dangerous.ts');
    });

    it('runs command on Enter in confirmation dialog', async () => {
      const onRun = vi.fn();
      const scripts = [
        createMockScript({ 
          id: 's1', 
          displayName: 'dangerous.ts',
          command: 'rm -rf /',
          cwd: '/danger',
          confirm: true,
        }),
      ];
      
      const { stdin } = render(
        <CommandPalette 
          {...defaultProps} 
          scripts={scripts}
          onSearch={() => scripts}
          onRun={onRun}
        />
      );
      
      await wait();
      stdin.write('\r'); // Enter to select (opens confirm)
      await wait();
      stdin.write('\r'); // Enter to confirm
      await wait();
      
      expect(onRun).toHaveBeenCalledWith('rm -rf /', '/danger');
    });

    it('cancels confirmation on Escape', async () => {
      const onRun = vi.fn();
      const scripts = [
        createMockScript({ 
          id: 's1', 
          displayName: 'dangerous.ts',
          confirm: true,
        }),
      ];
      
      const { lastFrame, stdin } = render(
        <CommandPalette 
          {...defaultProps} 
          scripts={scripts}
          onSearch={() => scripts}
          onRun={onRun}
        />
      );
      
      await wait();
      stdin.write('\r'); // Enter to select (opens confirm)
      await wait();
      stdin.write('\x1b'); // Escape to cancel
      await wait();
      
      expect(onRun).not.toHaveBeenCalled();
      // Should be back to search mode
      expect(lastFrame()).toContain('Run');
      expect(lastFrame()).not.toContain('Confirm');
    });
  });
});
