import React from 'react';
import { Box, Text } from 'ink';
import type { RunnableInstance, RunnableStatus } from '../types.js';

interface StatusBarProps {
  instances: RunnableInstance[];
  activeId: string | null;
}

const STATUS_COLORS: Record<RunnableStatus, string> = {
  stopped: 'gray',
  starting: 'yellow',
  running: 'green',
  error: 'red',
};

const STATUS_SYMBOLS: Record<RunnableStatus, string> = {
  stopped: '○',
  starting: '●',
  running: '●',
  error: '●',
};

export function StatusBar({ instances, activeId }: StatusBarProps) {
  return (
    <Box flexDirection="row" gap={2} paddingX={1}>
      {instances.map((instance) => {
        const isActive = instance.id === activeId;
        const color = STATUS_COLORS[instance.status];
        const symbol = STATUS_SYMBOLS[instance.status];
        
        return (
          <Box key={instance.id} flexDirection="row" gap={1}>
            <Text color={color}>{symbol}</Text>
            <Text 
              bold={isActive} 
              underline={isActive}
              color={isActive ? 'white' : undefined}
            >
              {instance.definition.name || instance.id}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
