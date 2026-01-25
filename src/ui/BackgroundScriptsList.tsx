import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { BackgroundScript } from "../types.js";

/** Renders a key + description hint */
function Hint({ keyName, desc }: { keyName: string; desc: string }) {
  return (
    <Box>
      <Text dimColor inverse>{` ${keyName} `}</Text>
      <Text dimColor> {desc}</Text>
    </Box>
  );
}

interface BackgroundScriptsListProps {
  scripts: BackgroundScript[];
  width: number;
  height: number;
  onClose: () => void;
  onRestore: (id: string) => void;
  onDismiss: (id: string) => void;
  onCancel: (id: string) => void;
}

const STATUS_COLORS: Record<BackgroundScript["status"], string> = {
  running: "yellow",
  success: "green",
  error: "red",
};

const STATUS_SYMBOLS: Record<BackgroundScript["status"], string> = {
  running: "⏳",
  success: "✓",
  error: "✗",
};

export function BackgroundScriptsList({
  scripts,
  width,
  height,
  onClose,
  onRestore,
  onDismiss,
  onCancel,
}: BackgroundScriptsListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((char, key) => {
    // Close on escape or b
    if (key.escape || char === "b") {
      onClose();
      return;
    }

    // Navigate with j/k or arrows
    if (char === "j" || key.downArrow) {
      setSelectedIndex((i) => Math.min(i + 1, scripts.length - 1));
      return;
    }

    if (char === "k" || key.upArrow) {
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }

    // Enter to restore/view
    if (key.return && scripts.length > 0) {
      onRestore(scripts[selectedIndex].id);
      return;
    }

    // d to dismiss completed script
    if (char === "d" && scripts.length > 0) {
      const script = scripts[selectedIndex];
      if (script.status !== "running") {
        onDismiss(script.id);
        // Adjust selection if needed
        if (selectedIndex >= scripts.length - 1) {
          setSelectedIndex(Math.max(0, scripts.length - 2));
        }
      }
      return;
    }

    // c to cancel running script
    if (char === "c" && scripts.length > 0) {
      const script = scripts[selectedIndex];
      if (script.status === "running") {
        onCancel(script.id);
      }
      return;
    }
  });

  // Keep selection in bounds
  const safeIndex = Math.min(selectedIndex, Math.max(0, scripts.length - 1));

  // Calculate content height
  const contentHeight = Math.max(5, height - 6); // header + footer + padding

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
        <Text bold>Background Scripts</Text>
        <Text dimColor> ({scripts.length})</Text>
      </Box>

      {/* Script list */}
      <Box flexDirection="column" flexGrow={1}>
        {scripts.length === 0 ? (
          <Text dimColor>No background scripts running</Text>
        ) : (
          scripts.slice(0, contentHeight).map((script, index) => {
            const isSelected = index === safeIndex;
            const color = STATUS_COLORS[script.status];
            const symbol = STATUS_SYMBOLS[script.status];
            const duration = formatDuration(script.duration);
            const command = truncateCommand(script.command, width - 25);

            return (
              <Box key={script.id}>
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "❯ " : "  "}
                </Text>
                <Text color={color}>{symbol} </Text>
                <Text bold={isSelected}>{command}</Text>
                <Text dimColor> {duration}</Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer hints */}
      <Box gap={2}>
        <Hint keyName="enter" desc="view" />
        <Hint keyName="d" desc="dismiss" />
        <Hint keyName="c" desc="cancel" />
        <Hint keyName="esc" desc="close" />
      </Box>
    </Box>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function truncateCommand(cmd: string, maxLen: number): string {
  if (cmd.length <= maxLen) return cmd;
  return cmd.slice(0, maxLen - 1) + "…";
}
