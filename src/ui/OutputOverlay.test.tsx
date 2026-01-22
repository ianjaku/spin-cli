import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutputOverlay } from './OutputOverlay.js';

// Helper to wait for React effects to run
const wait = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

describe('OutputOverlay', () => {
  const defaultProps = {
    command: 'bun run migrate.ts',
    cwd: '/project/scripts',
    output: [] as string[],
    status: 'idle' as const,
    exitCode: null,
    duration: 0,
    width: 80,
    height: 24,
    onClose: vi.fn(),
    onRerun: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the command in header', () => {
      const { lastFrame } = render(<OutputOverlay {...defaultProps} />);
      
      expect(lastFrame()).toContain('bun run migrate.ts');
    });

    it('renders the working directory', () => {
      const { lastFrame } = render(<OutputOverlay {...defaultProps} />);
      
      expect(lastFrame()).toContain('Running in:');
      expect(lastFrame()).toContain('/project/scripts');
    });

    it('renders output lines', () => {
      const { lastFrame } = render(
        <OutputOverlay 
          {...defaultProps} 
          output={['Line 1', 'Line 2', 'Line 3']}
        />
      );
      
      expect(lastFrame()).toContain('Line 1');
      expect(lastFrame()).toContain('Line 2');
      expect(lastFrame()).toContain('Line 3');
    });

    it('shows "No output" when output is empty and not running', () => {
      const { lastFrame } = render(
        <OutputOverlay {...defaultProps} status="success" />
      );
      
      expect(lastFrame()).toContain('No output');
    });

    it('shows "Waiting for output" when running with no output', () => {
      const { lastFrame } = render(
        <OutputOverlay {...defaultProps} status="running" />
      );
      
      expect(lastFrame()).toContain('Waiting for output');
    });
  });

  describe('status indicators', () => {
    it('shows running indicator', () => {
      const { lastFrame } = render(
        <OutputOverlay {...defaultProps} status="running" />
      );
      
      expect(lastFrame()).toContain('Running');
      expect(lastFrame()).toContain('●');
    });

    it('shows success indicator', () => {
      const { lastFrame } = render(
        <OutputOverlay {...defaultProps} status="success" />
      );
      
      expect(lastFrame()).toContain('Completed');
      expect(lastFrame()).toContain('✓');
    });

    it('shows error indicator with exit code', () => {
      const { lastFrame } = render(
        <OutputOverlay 
          {...defaultProps} 
          status="error" 
          exitCode={1}
        />
      );
      
      expect(lastFrame()).toContain('Failed');
      expect(lastFrame()).toContain('1');
      expect(lastFrame()).toContain('✗');
    });
  });

  describe('duration display', () => {
    it('formats milliseconds', () => {
      const { lastFrame } = render(
        <OutputOverlay {...defaultProps} status="running" duration={500} />
      );
      
      expect(lastFrame()).toContain('500ms');
    });

    it('formats seconds', () => {
      const { lastFrame } = render(
        <OutputOverlay {...defaultProps} status="running" duration={2500} />
      );
      
      expect(lastFrame()).toContain('2.5s');
    });

    it('formats minutes and seconds', () => {
      const { lastFrame } = render(
        <OutputOverlay {...defaultProps} status="running" duration={125000} />
      );
      
      expect(lastFrame()).toContain('2m');
    });
  });

  describe('keyboard shortcuts display', () => {
    it('shows cancel shortcut when running', () => {
      const { lastFrame } = render(
        <OutputOverlay {...defaultProps} status="running" />
      );
      
      expect(lastFrame()).toContain('Ctrl+C');
      expect(lastFrame()).toContain('cancel');
    });

    it('shows close and rerun shortcuts when not running', () => {
      const { lastFrame } = render(
        <OutputOverlay {...defaultProps} status="success" />
      );
      
      expect(lastFrame()).toContain('Enter');
      expect(lastFrame()).toContain('close');
      expect(lastFrame()).toContain('[r]');
      expect(lastFrame()).toContain('rerun');
    });

    it('shows copy shortcut when onCopy provided', () => {
      const { lastFrame } = render(
        <OutputOverlay 
          {...defaultProps} 
          status="success"
          onCopy={vi.fn()}
        />
      );
      
      expect(lastFrame()).toContain('[y]');
      expect(lastFrame()).toContain('copy');
    });
  });

  describe('keyboard handling', () => {
    it('calls onClose on Enter', async () => {
      const onClose = vi.fn();
      const { stdin } = render(
        <OutputOverlay {...defaultProps} status="success" onClose={onClose} />
      );
      
      await wait();
      stdin.write('\r'); // Enter
      await wait();
      
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose on Escape', async () => {
      const onClose = vi.fn();
      const { stdin } = render(
        <OutputOverlay {...defaultProps} status="success" onClose={onClose} />
      );
      
      await wait();
      stdin.write('\x1b'); // Escape
      await wait();
      
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onRerun on r when not running', async () => {
      const onRerun = vi.fn();
      const { stdin } = render(
        <OutputOverlay {...defaultProps} status="success" onRerun={onRerun} />
      );
      
      await wait();
      stdin.write('r');
      await wait();
      
      expect(onRerun).toHaveBeenCalled();
    });

    it('does not call onRerun when running', async () => {
      const onRerun = vi.fn();
      const { stdin } = render(
        <OutputOverlay {...defaultProps} status="running" onRerun={onRerun} />
      );
      
      await wait();
      stdin.write('r');
      await wait();
      
      expect(onRerun).not.toHaveBeenCalled();
    });

    it('calls onCopy on y', async () => {
      const onCopy = vi.fn();
      const { stdin } = render(
        <OutputOverlay {...defaultProps} status="success" onCopy={onCopy} />
      );
      
      await wait();
      stdin.write('y');
      await wait();
      
      expect(onCopy).toHaveBeenCalled();
    });

    it('calls onCancel on Ctrl+C when running', async () => {
      const onCancel = vi.fn();
      const { stdin } = render(
        <OutputOverlay {...defaultProps} status="running" onCancel={onCancel} />
      );
      
      await wait();
      stdin.write('\x03'); // Ctrl+C
      await wait();
      
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('output scrolling', () => {
    it('shows most recent lines when output exceeds height', () => {
      const output = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
      
      const { lastFrame } = render(
        <OutputOverlay 
          {...defaultProps} 
          output={output}
          height={20} // Only room for ~10 lines
        />
      );
      
      // Should show the last lines, not the first
      expect(lastFrame()).toContain('Line 50');
      expect(lastFrame()).toContain('Line 49');
      // First lines should not be visible
      expect(lastFrame()).not.toContain('Line 1');
    });
  });

  describe('command truncation', () => {
    it('truncates long commands', () => {
      const longCommand = 'bun run ' + 'very-long-path/'.repeat(10) + 'script.ts';
      
      const { lastFrame } = render(
        <OutputOverlay {...defaultProps} command={longCommand} width={60} />
      );
      
      expect(lastFrame()).toContain('…');
    });
  });
});
