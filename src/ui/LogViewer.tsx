import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { RunnableManager } from "../runnables/manager.js";
import type { RunnableInstance } from "../types.js";
import { useManagerStore } from "../state/managerStore.js";

interface LogViewerProps {
  instance: RunnableInstance | null;
  manager: RunnableManager;
  height: number;
  width?: number;
  isActive: boolean;
}

export function LogViewer({
  instance,
  manager,
  height,
  width,
  isActive,
}: LogViewerProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [followMode, setFollowMode] = useState(true);

  const outputTick = useManagerStore((state) =>
    instance ? (state.outputTicks[instance.id] ?? 0) : 0,
  );
  const lines = useMemo(() => {
    if (!instance) return [];
    return manager.getOutputLines(instance.id, "all");
  }, [instance?.id, manager, outputTick]);
  // Reserve space for hint when not following (1 line for header, 1 for hint when scrolled)
  const baseVisibleLines = height - 1;
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

    // j/down - scroll down
    if (input === "j" || key.downArrow) {
      const maxOffset = Math.max(0, lines.length - visibleLines);
      setScrollOffset((o) => {
        const newOffset = Math.min(o + 1, maxOffset);
        // Auto-enable follow mode when reaching bottom
        if (newOffset >= maxOffset) {
          setFollowMode(true);
        } else {
          setFollowMode(false);
        }
        return newOffset;
      });
    }

    // k/up - scroll up
    if (input === "k" || key.upArrow) {
      setFollowMode(false);
      setScrollOffset((o) => Math.max(0, o - 1));
    }

    // ctrl+d - page down
    if (key.ctrl && input === "d") {
      const maxOffset = Math.max(0, lines.length - visibleLines);
      setScrollOffset((o) => {
        const newOffset = Math.min(o + Math.floor(visibleLines / 2), maxOffset);
        // Auto-enable follow mode when reaching bottom
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
  });

  if (!instance) {
    return (
      <Box
        flexGrow={1}
        width={width}
        flexDirection="column"
        paddingX={2}
        paddingY={1}
      >
        <Text dimColor>no service selected</Text>
      </Box>
    );
  }

  const displayLines = lines.slice(scrollOffset, scrollOffset + visibleLines);
  const serviceName = instance.definition.name || instance.id;

  // Show waiting state with dependency list
  if (instance.status === 'waiting' && instance.waitingFor) {
    return (
      <Box flexGrow={1} width={width} flexDirection="column" paddingX={2}>
        <Box justifyContent="space-between">
          <Text bold>{serviceName}</Text>
        </Box>
        <Box flexDirection="column" paddingY={1}>
          <Text dimColor>Waiting for dependencies:</Text>
          <Box flexDirection="column" marginTop={1}>
            {instance.waitingFor.map(depId => {
              const dep = manager.get(depId);
              const depStatus = dep?.status ?? 'stopped';
              const color = depStatus === 'running' ? 'green' 
                          : depStatus === 'error' ? 'red' 
                          : depStatus === 'starting' ? 'yellow' 
                          : 'gray';
              const symbol = depStatus === 'running' ? '✓'
                           : depStatus === 'error' ? '✗'
                           : depStatus === 'starting' ? '◐'
                           : '○';
              return (
                <Box key={depId} gap={1}>
                  <Text color={color}>{symbol}</Text>
                  <Text>{dep?.definition.name || depId}</Text>
                  <Text dimColor>({depStatus})</Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexGrow={1} width={width} flexDirection="column" paddingX={2}>
      {/* Header line */}
      <Box justifyContent="space-between">
        <Text bold>{serviceName}</Text>
        <Box gap={2}>
          {!followMode && <Text dimColor>scrolled</Text>}
          {lines.length > 0 && <Text dimColor>{lines.length} lines</Text>}
        </Box>
      </Box>

      {/* Log output */}
      <Box flexDirection="column" flexGrow={1}>
        {displayLines.length === 0 ? (
          <Text dimColor>waiting for output...</Text>
        ) : (
          displayLines.map((line, i) => (
            <Text key={scrollOffset + i} wrap="truncate">
              {line}
            </Text>
          ))
        )}
      </Box>

      {/* Follow mode hint - shown at bottom right when scrolled up */}
      {!followMode && lines.length > visibleLines && (
        <Box justifyContent="flex-end">
          <Text dimColor inverse>
            {" "}
            Press{" "}
          </Text>
          <Text bold inverse>
            F
          </Text>
          <Text dimColor inverse>
            {" "}
            to scroll to bottom{" "}
          </Text>
        </Box>
      )}
    </Box>
  );
}
