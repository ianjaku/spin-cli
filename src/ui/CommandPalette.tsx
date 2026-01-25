import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { ResolvedScript } from "../types.js";

/** Renders a key + description hint */
function Hint({ keyName, desc }: { keyName: string; desc: string }) {
  return (
    <Box>
      <Text backgroundColor="#1a1a1a" dimColor>{` ${keyName} `}</Text>
      <Text dimColor> {desc}</Text>
    </Box>
  );
}

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

type PaletteMode = "search" | "confirm";

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
  const [input, setInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [mode, setMode] = useState<PaletteMode>("search");
  const [confirmScript, setConfirmScript] = useState<ResolvedScript | null>(
    null,
  );

  // Calculate dimensions
  const maxResults = Math.max(1, height - 6); // Account for borders and input

  // Determine if input should bypass search
  const shouldBypass = useMemo(() => {
    if (!input.trim()) return false;
    if (input.startsWith("!")) return true;
    const firstWord = input.split(" ")[0];
    return shellCommands.includes(firstWord);
  }, [input, shellCommands]);

  // Get search results
  const results = useMemo(() => {
    if (shouldBypass) return [];
    return onSearch(input).slice(0, maxResults);
  }, [input, shouldBypass, onSearch, maxResults]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results.length]);

  // Handle running a command
  const handleRun = useCallback(
    (command: string, targetCwd: string, script?: ResolvedScript) => {
      // Check if confirmation is needed
      if (script?.confirm) {
        setConfirmScript(script);
        setMode("confirm");
        return;
      }
      onRun(command, targetCwd);
    },
    [onRun],
  );

  // Handle confirmation
  const handleConfirm = useCallback(() => {
    if (confirmScript) {
      onRun(confirmScript.command, confirmScript.cwd);
    }
  }, [confirmScript, onRun]);

  // Handle keyboard input
  useInput((char, key) => {
    // Confirmation mode
    if (mode === "confirm") {
      if (key.return) {
        handleConfirm();
      } else if (key.escape) {
        setMode("search");
        setConfirmScript(null);
      }
      return;
    }

    // Search mode
    if (key.escape || (key.ctrl && char === "c")) {
      onClose();
      return;
    }

    if (key.return) {
      // Run command
      if (shouldBypass) {
        // Strip ! prefix if present
        const cmd = input.startsWith("!") ? input.slice(1).trim() : input;
        onRun(cmd, cwd);
      } else if (results.length > 0) {
        const script = results[selectedIndex === -1 ? 0 : selectedIndex];
        handleRun(script.command, script.cwd, script);
      } else if (input.trim()) {
        // No matches - run as shell command
        onRun(input, cwd);
      }
      return;
    }

    if (key.tab && results.length > 0) {
      // Autofill selected command
      const script = results[selectedIndex === -1 ? 0 : selectedIndex];
      setInput(script.command);
      setHistoryIndex(-1);
      return;
    }

    // Arrow navigation
    if (key.upArrow) {
      // If already navigating history, continue
      if (historyIndex >= 0 && historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex] || "");
      }
      // If no selection and empty input, start history
      else if (selectedIndex === -1 && input === "" && history.length > 0) {
        setHistoryIndex(0);
        setInput(history[0] || "");
      }
      // If at first item, deselect
      else if (selectedIndex === 0) {
        setSelectedIndex(-1);
      }
      // Otherwise navigate up
      else if (selectedIndex > 0) {
        setSelectedIndex((i) => i - 1);
      }
      return;
    }

    if (key.downArrow) {
      if (historyIndex > -1) {
        // Cycle through history
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(newIndex >= 0 ? history[newIndex] || "" : "");
      } else if (results.length > 0) {
        // Navigate results
        setSelectedIndex((i) => Math.min(results.length - 1, i + 1));
      }
      return;
    }

    // Backspace
    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setHistoryIndex(-1);
      return;
    }

    // Regular character input
    if (char && !key.ctrl && !key.meta) {
      setInput((prev) => prev + char);
      setHistoryIndex(-1);
    }
  });

  // Calculate max width for truncation
  const maxNameWidth = Math.max(20, width - 30);

  // Render confirmation dialog (full-screen)
  if (mode === "confirm" && confirmScript) {
    return (
      <Box
        flexDirection="column"
        width={width}
        height={height}
        paddingX={2}
        paddingY={1}
      >
        {/* Header */}
        <Box marginBottom={1}>
          <Text bold color="yellow">
            Confirm execution
          </Text>
        </Box>

        {/* Command info */}
        <Box flexDirection="column" marginBottom={1}>
          <Text>{confirmScript.displayName}</Text>
          <Text dimColor>{confirmScript.command}</Text>
          {confirmScript.description && (
            <Text dimColor>{confirmScript.description}</Text>
          )}
        </Box>

        {/* Spacer */}
        <Box flexGrow={1} />

        {/* Footer hints */}
        <Box gap={2}>
          <Hint keyName="enter" desc="confirm" />
          <Hint keyName="esc" desc="cancel" />
        </Box>
      </Box>
    );
  }

  // Render search palette (full-screen)
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      paddingX={2}
      paddingY={1}
    >
      {/* Input line */}
      <Box marginBottom={1}>
        <Text dimColor>: </Text>
        <Text>{input}</Text>
        <Text dimColor>_</Text>
      </Box>

      {/* Results area */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {shouldBypass ? (
          <Text dimColor>shell command</Text>
        ) : results.length > 0 ? (
          results.map((script, index) => (
            <Box key={script.id}>
              <Text>{index === selectedIndex ? "> " : "  "}</Text>
              <Text>{truncate(script.displayName, maxNameWidth)}</Text>
              {script.description && (
                <Text dimColor> {truncate(script.description, 40)}</Text>
              )}
              {index === 0 && selectedIndex === -1 && (
                <Text dimColor> (enter to run)</Text>
              )}
            </Box>
          ))
        ) : input.trim() ? (
          <Text dimColor>no matches, will run as shell command</Text>
        ) : scripts.length === 0 ? (
          <Box
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
            flexGrow={1}
          >
            <Text dimColor>no scripts configured</Text>
            <Box marginTop={1}>
              <Text dimColor>see </Text>
              <Text color="cyan">https://spin-cli.dev/docs/scripts</Text>
            </Box>
          </Box>
        ) : (
          // Show first few scripts when no input
          scripts.slice(0, maxResults).map((script, index) => (
            <Box key={script.id}>
              <Text>{index === selectedIndex ? "> " : "  "}</Text>
              <Text>{truncate(script.displayName, maxNameWidth)}</Text>
              {script.description && (
                <Text dimColor> {truncate(script.description, 40)}</Text>
              )}
              {index === 0 && selectedIndex === -1 && (
                <Text dimColor> (enter to run)</Text>
              )}
            </Box>
          ))
        )}
      </Box>

      {/* Footer hints */}
      <Box gap={2}>
        <Hint keyName="enter" desc="run" />
        <Hint keyName="tab" desc="fill" />
        <Hint keyName="esc" desc="close" />
      </Box>
    </Box>
  );
}

/** Truncate string to max length */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}
