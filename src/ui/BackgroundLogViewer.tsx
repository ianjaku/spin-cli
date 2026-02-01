import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { BackgroundScript } from "../types.js";

interface BackgroundLogViewerProps {
  script: BackgroundScript;
  height: number;
  width?: number;
  isActive: boolean;
  onCancel: () => void;
  onDismiss: () => void;
}

const STATUS_COLORS: Record<BackgroundScript["status"], string> = {
  running: "yellow",
  success: "green",
  error: "red",
};

export function BackgroundLogViewer({
  script,
  height,
  width,
  isActive,
  onCancel,
  onDismiss,
}: BackgroundLogViewerProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [followMode, setFollowMode] = useState(true);

  const lines = script.output;

  // Reserve space for header and hint when not following
  const baseVisibleLines = height - 2; // header + status line
  const visibleLines = followMode ? baseVisibleLines : baseVisibleLines - 1;

  // Auto-scroll to bottom when new output arrives (if in follow mode)
  useEffect(() => {
    if (followMode) {
      setScrollOffset(Math.max(0, lines.length - visibleLines));
    }
  }, [lines.length, followMode, visibleLines]);

  // Handle keyboard input
  useInput((input, key) => {
    if (!isActive) return;

    // j/down - scroll down (3 lines at a time)
    if (input === "j" || key.downArrow) {
      const maxOffset = Math.max(0, lines.length - visibleLines);
      setScrollOffset((o) => {
        const newOffset = Math.min(o + 3, maxOffset);
        if (newOffset >= maxOffset) {
          setFollowMode(true);
        } else {
          setFollowMode(false);
        }
        return newOffset;
      });
    }

    // k/up - scroll up (3 lines at a time)
    if (input === "k" || key.upArrow) {
      setFollowMode(false);
      setScrollOffset((o) => Math.max(0, o - 3));
    }

    // ctrl+d - page down
    if (key.ctrl && input === "d") {
      const maxOffset = Math.max(0, lines.length - visibleLines);
      setScrollOffset((o) => {
        const newOffset = Math.min(o + Math.floor(visibleLines / 2), maxOffset);
        if (newOffset >= maxOffset) {
          setFollowMode(true);
        } else {
          setFollowMode(false);
        }
        return newOffset;
      });
    }

    // ctrl+u - page up
    if (key.ctrl && input === "u") {
      setFollowMode(false);
      setScrollOffset((o) => Math.max(0, o - Math.floor(visibleLines / 2)));
    }

    // g - go to top
    if (input === "g") {
      setFollowMode(false);
      setScrollOffset(0);
    }

    // G - go to bottom
    if (input === "G") {
      setFollowMode(true);
      setScrollOffset(Math.max(0, lines.length - visibleLines));
    }

    // f - scroll to bottom and enable follow mode
    if (input === "f") {
      setFollowMode(true);
      setScrollOffset(Math.max(0, lines.length - visibleLines));
    }

    // c - cancel if running
    if (input === "c" && script.status === "running") {
      onCancel();
    }

    // d - dismiss if completed
    if (input === "d" && script.status !== "running") {
      onDismiss();
    }
  });

  const displayLines = lines.slice(scrollOffset, scrollOffset + visibleLines);
  const command = truncateCommand(script.command, (width || 80) - 30);
  const statusColor = STATUS_COLORS[script.status];
  const statusText =
    script.status === "running"
      ? "running"
      : script.status === "success"
        ? "done"
        : `failed (${script.exitCode})`;

  return (
    <Box flexGrow={1} width={width} flexDirection="column" paddingX={2}>
      {/* Header line */}
      <Box justifyContent="space-between">
        <Box>
          <Text dimColor>$ </Text>
          <Text bold>{command}</Text>
        </Box>
        <Box gap={2}>
          {!followMode && <Text dimColor>scrolled</Text>}
          {lines.length > 0 && <Text dimColor>{lines.length} lines</Text>}
          <Text color={statusColor}>{statusText}</Text>
        </Box>
      </Box>

      {/* Log output */}
      <Box flexDirection="column" flexGrow={1}>
        {displayLines.length === 0 ? (
          <Text dimColor>
            {script.status === "running" ? "waiting for output..." : "no output"}
          </Text>
        ) : (
          displayLines.map((line, i) => (
            <Text key={scrollOffset + i} wrap="truncate">
              {line}
            </Text>
          ))
        )}
      </Box>

      {/* Action hints */}
      <Box justifyContent="space-between">
        <Box gap={2}>
          {script.status === "running" ? (
            <Text dimColor>
              <Text inverse> c </Text> cancel
            </Text>
          ) : (
            <Text dimColor>
              <Text inverse> d </Text> dismiss
            </Text>
          )}
        </Box>
        {!followMode && lines.length > visibleLines && (
          <Box>
            <Text dimColor inverse> Press </Text>
            <Text bold inverse>F</Text>
            <Text dimColor inverse> to scroll to bottom </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function truncateCommand(cmd: string, maxLen: number): string {
  if (cmd.length <= maxLen) return cmd;
  return cmd.slice(0, maxLen - 1) + "…";
}
