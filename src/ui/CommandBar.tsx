import React from 'react';
import { Box, Text } from 'ink';

interface CommandBarProps {
  message?: string;
}

interface Shortcut {
  key: string;
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { key: '1-9', label: 'switch' },
  { key: 'j/k', label: 'scroll' },
  { key: 'f', label: 'follow' },
  { key: 'r', label: 'restart' },
  { key: 's', label: 'stop' },
  { key: 'a', label: 'start' },
  { key: 'q', label: 'quit' },
  { key: '?', label: 'help' },
];

export function CommandBar({ message }: CommandBarProps) {
  return (
    <Box 
      paddingX={1} 
      justifyContent="space-between"
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
    >
      <Box gap={1}>
        {SHORTCUTS.map(({ key, label }) => (
          <Box key={key} gap={0}>
            <Text bold color="cyan">{key}</Text>
            <Text dimColor>:{label}</Text>
            <Text> </Text>
          </Box>
        ))}
      </Box>
      
      {message && (
        <Text color="yellow">{message}</Text>
      )}
    </Box>
  );
}
