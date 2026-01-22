import React, { useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ScriptRunnerStatus } from '../scripts/runner.js';

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
}: OutputOverlayProps) {
  const scrollRef = useRef(0);

  // Handle keyboard input
  useInput((char, key) => {
    if (key.return || key.escape) {
      onClose();
      return;
    }

    if (char === 'r' && status !== 'running') {
      onRerun();
      return;
    }

    if (char === 'y' && onCopy) {
      onCopy();
      return;
    }

    if (key.ctrl && char === 'c' && status === 'running') {
      onCancel();
      return;
    }
  });

  // Calculate dimensions
  const overlayWidth = Math.min(80, width - 4);
  const contentHeight = Math.max(5, height - 10);

  // Get visible output lines (auto-scroll to bottom)
  const visibleLines = output.slice(-contentHeight);

  // Status indicator
  const statusIndicator = getStatusIndicator(status, exitCode);
  const statusColor = getStatusColor(status, exitCode);

  // Format duration
  const formattedDuration = formatDuration(duration);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={statusColor}
      width={overlayWidth}
    >
      {/* Header */}
      <Box 
        paddingX={1} 
        borderBottom 
        borderStyle="single"
        justifyContent="space-between"
      >
        <Box>
          <Text bold color={statusColor}>{statusIndicator} </Text>
          <Text bold>{truncateCommand(command, overlayWidth - 20)}</Text>
        </Box>
        {status !== 'idle' && (
          <Text dimColor>{formattedDuration}</Text>
        )}
      </Box>

      {/* Working directory */}
      <Box paddingX={1}>
        <Text dimColor>Running in: {cwd}</Text>
      </Box>

      {/* Output */}
      <Box 
        flexDirection="column" 
        paddingX={1} 
        height={contentHeight}
        overflow="hidden"
      >
        {visibleLines.length === 0 ? (
          <Text dimColor>
            {status === 'running' ? 'Waiting for output...' : 'No output'}
          </Text>
        ) : (
          visibleLines.map((line, index) => (
            <Text key={index} wrap="truncate">
              {line}
            </Text>
          ))
        )}
      </Box>

      {/* Footer */}
      <Box 
        paddingX={1} 
        borderTop 
        borderStyle="single" 
        gap={2}
        justifyContent="space-between"
      >
        <Box gap={2}>
          {status === 'running' ? (
            <Text dimColor>[Ctrl+C] cancel</Text>
          ) : (
            <>
              <Text dimColor>[Enter] close</Text>
              <Text dimColor>[r] rerun</Text>
              {onCopy && <Text dimColor>[y] copy</Text>}
            </>
          )}
        </Box>
        <Box>
          {status === 'success' && (
            <Text color="green">✓ Completed</Text>
          )}
          {status === 'error' && (
            <Text color="red">✗ Failed{exitCode !== null ? ` (${exitCode})` : ''}</Text>
          )}
          {status === 'running' && (
            <Text color="yellow">● Running...</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function getStatusIndicator(status: ScriptRunnerStatus, exitCode?: number | null): string {
  switch (status) {
    case 'running':
      return '●';
    case 'success':
      return '✓';
    case 'error':
      return '✗';
    default:
      return '○';
  }
}

function getStatusColor(status: ScriptRunnerStatus, exitCode?: number | null): string {
  switch (status) {
    case 'running':
      return 'yellow';
    case 'success':
      return 'green';
    case 'error':
      return 'red';
    default:
      return 'gray';
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
  return cmd.slice(0, maxLen - 1) + '…';
}
