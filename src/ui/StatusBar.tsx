import React from "react";
import { Box, Text } from "ink";
import type { RunnableInstance, RunnableStatus, BackgroundScript, BackgroundScriptStatus } from "../types.js";

interface StatusBarProps {
  instances: RunnableInstance[];
  activeId: string | null;
  backgroundScripts?: BackgroundScript[];
  activeBackgroundId?: string | null;
  width?: number;
}

const STATUS_COLORS: Record<RunnableStatus, string> = {
  stopped: "gray",
  waiting: "yellow",
  starting: "yellow",
  running: "green",
  error: "red",
};

const STATUS_SYMBOLS: Record<RunnableStatus, string> = {
  stopped: "○",
  waiting: "●",
  starting: "●",
  running: "●",
  error: "●",
};

const BG_STATUS_COLORS: Record<BackgroundScriptStatus, string> = {
  running: "yellow",
  success: "green",
  error: "red",
};

const BG_STATUS_SYMBOLS: Record<BackgroundScriptStatus, string> = {
  running: "⏳",
  success: "✓",
  error: "✗",
};

/** Truncate command for display in tab */
function truncateCommand(cmd: string, maxLen: number = 15): string {
  // Get just the command name (first word)
  const firstWord = cmd.split(/\s+/)[0] ?? cmd;
  // Get basename if it's a path
  const basename = firstWord.split('/').pop() ?? firstWord;
  if (basename.length <= maxLen) return basename;
  return basename.slice(0, maxLen - 1) + "…";
}

export function StatusBar({
  instances,
  activeId,
  backgroundScripts = [],
  activeBackgroundId,
  width,
}: StatusBarProps) {
  return (
    <Box flexDirection="column">
      {/* Service tabs */}
      <Box flexDirection="row" gap={2} paddingX={2}>
        {/* Service instances */}
        {instances.map((instance) => {
          const isActive = instance.id === activeId;
          const color = STATUS_COLORS[instance.status];
          const symbol = STATUS_SYMBOLS[instance.status];
          const name = instance.definition.name || instance.id;

          return (
            <Box key={instance.id}>
              <Text color={color}>{symbol} </Text>
              <Text bold={isActive} underline={isActive}>
                {name}
              </Text>
            </Box>
          );
        })}

        {/* Background scripts (shown after services) */}
        {backgroundScripts.map((script) => {
          const isActive = script.id === activeBackgroundId;
          const color = BG_STATUS_COLORS[script.status];
          const symbol = BG_STATUS_SYMBOLS[script.status];
          const name = truncateCommand(script.command);

          return (
            <Box key={script.id}>
              <Text color={color}>{symbol} </Text>
              <Text bold={isActive} underline={isActive} dimColor={!isActive}>
                {name}
              </Text>
            </Box>
          );
        })}
      </Box>
      {/* Separator line */}
      <Text dimColor>{"─".repeat(width || 80)}</Text>
    </Box>
  );
}
