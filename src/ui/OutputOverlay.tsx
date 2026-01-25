import React from "react";
import { Box, Text, useInput } from "ink";
import type { ScriptRunnerStatus } from "../scripts/runner.js";

/** Renders a key + description hint */
function Hint({ keyName, desc }: { keyName: string; desc: string }) {
  return (
    <Box>
      <Text dimColor inverse>{` ${keyName} `}</Text>
      <Text dimColor> {desc}</Text>
    </Box>
  );
}

interface OutputOverlayProps {
  /** Command that was run */
  command: string;
  /** Working directory */
  cwd: string;
  /** Output lines */
  output: string[];
  /** Current status */
  status: ScriptRunnerStatus;
  /** Exit code (if finished) */
  exitCode?: number | null;
  /** Duration in milliseconds */
  duration: number;
  /** Width of the overlay */
  width: number;
  /** Height of the overlay */
  height: number;
  /** Called when overlay should close */
  onClose: () => void;
  /** Called to rerun the command */
  onRerun: () => void;
  /** Called to cancel the running command */
  onCancel: () => void;
  /** Called to copy output to clipboard */
  onCopy?: () => void;
  /** Called to minimize to background */
  onMinimize?: () => void;
}

export function OutputOverlay({
  command,
  cwd,
  output,
  status,
  exitCode,
  duration,
  width,
  height,
  onClose,
  onRerun,
  onCancel,
  onCopy,
  onMinimize,
}: OutputOverlayProps) {
  // Handle keyboard input
  useInput((char, key) => {
    if (key.return || key.escape) {
      onClose();
      return;
    }

    if (char === "r" && status !== "running") {
      onRerun();
      return;
    }

    if (char === "y" && onCopy) {
      onCopy();
      return;
    }

    // m - minimize to background
    if (char === "m" && onMinimize) {
      onMinimize();
      return;
    }

    // Handle Ctrl+C: cancel if running, close if done
    if (key.ctrl && char === "c") {
      if (status === "running") {
        onCancel();
      } else {
        onClose();
      }
      return;
    }
  });

  // Calculate dimensions - use full height minus header (2 lines) and footer (1 line)
  const contentHeight = Math.max(5, height - 4);

  // Get visible output lines (auto-scroll to bottom)
  const visibleLines = output.slice(-contentHeight);

  // Status indicator
  const statusColor = getStatusColor(status, exitCode);

  // Format duration
  const formattedDuration = formatDuration(duration);

  // Status text for header
  const statusText =
    status === "running"
      ? "running"
      : status === "success"
        ? "done"
        : status === "error"
          ? `failed${exitCode !== null ? ` (${exitCode})` : ""}`
          : "";

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      paddingX={2}
      paddingY={1}
    >
      {/* Header - command and status on one line */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text dimColor>$ </Text>
          <Text>{truncateCommand(command, width - 30)}</Text>
        </Box>
        <Box gap={2}>
          {status !== "idle" && <Text dimColor>{formattedDuration}</Text>}
          <Text color={statusColor}>{statusText}</Text>
        </Box>
      </Box>

      {/* Output area - takes remaining space */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleLines.length === 0 ? (
          <Text dimColor>
            {status === "running" ? "waiting for output..." : "no output"}
          </Text>
        ) : (
          visibleLines.map((line, index) => (
            <Text key={index} wrap="truncate">
              {line}
            </Text>
          ))
        )}
      </Box>

      {/* Footer hints */}
      <Box gap={2}>
        {status === "running" ? (
          <>
            <Hint keyName="ctrl+c" desc="cancel" />
            {onMinimize && <Hint keyName="m" desc="minimize" />}
          </>
        ) : (
          <>
            <Hint keyName="enter" desc="close" />
            <Hint keyName="r" desc="rerun" />
            {onCopy && <Hint keyName="y" desc="copy" />}
            {onMinimize && <Hint keyName="m" desc="minimize" />}
          </>
        )}
      </Box>
    </Box>
  );
}

function getStatusColor(
  status: ScriptRunnerStatus,
  exitCode?: number | null,
): string {
  switch (status) {
    case "running":
      return "yellow";
    case "success":
      return "green";
    case "error":
      return "red";
    default:
      return "gray";
  }
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
