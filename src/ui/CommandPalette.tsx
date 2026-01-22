import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ResolvedScript } from '../types.js';

interface CommandPaletteProps {
  /** All available scripts */
  scripts: ResolvedScript[];
  /** Shell command prefixes that bypass search */
  shellCommands: string[];
  /** Command history (newest first) */
  history: string[];
  /** Current working directory for ad-hoc commands */
  cwd: string;
  /** Width of the palette */
  width: number;
  /** Height of the palette */
  height: number;
  /** Called when a command should be run */
  onRun: (command: string, cwd: string, confirm?: boolean) => void;
  /** Called when the palette should close */
  onClose: () => void;
  /** Called to search scripts */
  onSearch: (query: string) => ResolvedScript[];
}

type PaletteMode = 'search' | 'confirm';

export function CommandPalette({
  scripts,
  shellCommands,
  history,
  cwd,
  width,
  height,
  onRun,
  onClose,
  onSearch,
}: CommandPaletteProps) {
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [mode, setMode] = useState<PaletteMode>('search');
  const [confirmScript, setConfirmScript] = useState<ResolvedScript | null>(null);

  // Calculate dimensions
  const maxResults = Math.max(1, height - 6); // Account for borders and input

  // Determine if input should bypass search
  const shouldBypass = useMemo(() => {
    if (!input.trim()) return false;
    if (input.startsWith('!')) return true;
    const firstWord = input.split(' ')[0];
    return shellCommands.includes(firstWord);
  }, [input, shellCommands]);

  // Get search results
  const results = useMemo(() => {
    if (shouldBypass) return [];
    return onSearch(input).slice(0, maxResults);
  }, [input, shouldBypass, onSearch, maxResults]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // Handle running a command
  const handleRun = useCallback((command: string, targetCwd: string, script?: ResolvedScript) => {
    // Check if confirmation is needed
    if (script?.confirm) {
      setConfirmScript(script);
      setMode('confirm');
      return;
    }
    onRun(command, targetCwd);
  }, [onRun]);

  // Handle confirmation
  const handleConfirm = useCallback(() => {
    if (confirmScript) {
      onRun(confirmScript.command, confirmScript.cwd);
    }
  }, [confirmScript, onRun]);

  // Handle keyboard input
  useInput((char, key) => {
    // Confirmation mode
    if (mode === 'confirm') {
      if (key.return) {
        handleConfirm();
      } else if (key.escape) {
        setMode('search');
        setConfirmScript(null);
      }
      return;
    }

    // Search mode
    if (key.escape || (key.ctrl && char === 'c')) {
      onClose();
      return;
    }

    if (key.return) {
      // Run command
      if (shouldBypass) {
        // Strip ! prefix if present
        const cmd = input.startsWith('!') ? input.slice(1).trim() : input;
        onRun(cmd, cwd);
      } else if (results.length > 0) {
        const script = results[selectedIndex];
        handleRun(script.command, script.cwd, script);
      } else if (input.trim()) {
        // No matches - run as shell command
        onRun(input, cwd);
      }
      return;
    }

    if (key.tab && results.length > 0) {
      // Autofill selected command
      const script = results[selectedIndex];
      setInput(script.command);
      setHistoryIndex(-1);
      return;
    }

    // Arrow navigation
    if (key.upArrow) {
      // Allow history navigation if input is empty OR we're already navigating history
      if ((input === '' || historyIndex >= 0) && historyIndex < history.length - 1) {
        // Cycle through history
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex] || '');
      } else if (results.length > 0) {
        // Navigate results
        setSelectedIndex(i => Math.max(0, i - 1));
      }
      return;
    }

    if (key.downArrow) {
      if (historyIndex > -1) {
        // Cycle through history
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(newIndex >= 0 ? history[newIndex] || '' : '');
      } else if (results.length > 0) {
        // Navigate results
        setSelectedIndex(i => Math.min(results.length - 1, i + 1));
      }
      return;
    }

    // Backspace
    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      setHistoryIndex(-1);
      return;
    }

    // Regular character input
    if (char && !key.ctrl && !key.meta) {
      setInput(prev => prev + char);
      setHistoryIndex(-1);
    }
  });

  // Render confirmation dialog
  if (mode === 'confirm' && confirmScript) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        width={Math.min(60, width - 4)}
      >
        <Box marginBottom={1}>
          <Text bold color="yellow">Confirm</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text>Run "{confirmScript.displayName}"?</Text>
          <Text dimColor>Command: {confirmScript.command}</Text>
          {confirmScript.description && (
            <Text dimColor>{confirmScript.description}</Text>
          )}
        </Box>
        <Box gap={2}>
          <Text dimColor>[Enter] confirm</Text>
          <Text dimColor>[Escape] cancel</Text>
        </Box>
      </Box>
    );
  }

  // Render search palette
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      width={Math.min(70, width - 4)}
    >
      {/* Header */}
      <Box paddingX={1} borderBottom borderStyle="single">
        <Text bold color="cyan">Run</Text>
      </Box>

      {/* Input */}
      <Box paddingX={1} paddingY={0}>
        <Text color="cyan">&gt; </Text>
        <Text>{input}</Text>
        <Text color="cyan">█</Text>
      </Box>

      {/* Results */}
      <Box flexDirection="column" paddingX={1} paddingY={0}>
        {shouldBypass ? (
          <Text dimColor>
            (will run as shell command)
          </Text>
        ) : results.length > 0 ? (
          results.map((script, index) => (
            <Box key={script.id} gap={1}>
              <Text color={index === selectedIndex ? 'cyan' : undefined}>
                {index === selectedIndex ? '▸' : ' '}
              </Text>
              <Text
                bold={index === selectedIndex}
                color={index === selectedIndex ? 'white' : undefined}
              >
                {truncate(script.displayName, 30)}
              </Text>
              <Text dimColor>→</Text>
              <Text dimColor>{script.runnerLabel}</Text>
            </Box>
          ))
        ) : input.trim() ? (
          <Text dimColor>
            (no matches - will run as shell command)
          </Text>
        ) : scripts.length === 0 ? (
          <Text dimColor>No scripts configured</Text>
        ) : (
          // Show first few scripts when no input
          scripts.slice(0, maxResults).map((script, index) => (
            <Box key={script.id} gap={1}>
              <Text color={index === selectedIndex ? 'cyan' : undefined}>
                {index === selectedIndex ? '▸' : ' '}
              </Text>
              <Text
                bold={index === selectedIndex}
                color={index === selectedIndex ? 'white' : undefined}
              >
                {truncate(script.displayName, 30)}
              </Text>
              <Text dimColor>→</Text>
              <Text dimColor>{script.runnerLabel}</Text>
            </Box>
          ))
        )}
      </Box>

      {/* Footer */}
      <Box paddingX={1} paddingTop={0} borderTop borderStyle="single" gap={2}>
        <Text dimColor>Enter:run</Text>
        <Text dimColor>Tab:fill</Text>
        <Text dimColor>↑↓:nav</Text>
        <Text dimColor>Esc:close</Text>
      </Box>
    </Box>
  );
}

/** Truncate string to max length */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
