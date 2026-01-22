import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface HelpPopupProps {
  onClose: () => void;
  width: number;
  height: number;
}

interface CommandGroup {
  title: string;
  commands: { key: string; description: string }[];
}

const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: 'Navigation',
    commands: [
      { key: '1-9', description: 'Switch to service by number' },
      { key: 'Tab', description: 'Cycle to next service' },
      { key: 'Shift+Tab', description: 'Cycle to previous service' },
    ],
  },
  {
    title: 'Scrolling',
    commands: [
      { key: 'j / ↓', description: 'Scroll down one line' },
      { key: 'k / ↑', description: 'Scroll up one line' },
      { key: 'Ctrl+d', description: 'Scroll down half page' },
      { key: 'Ctrl+u', description: 'Scroll up half page' },
      { key: 'g', description: 'Go to top' },
      { key: 'G', description: 'Go to bottom' },
      { key: 'f', description: 'Toggle follow mode (auto-scroll)' },
    ],
  },
  {
    title: 'Service Control',
    commands: [
      { key: 'r', description: 'Restart current service' },
      { key: 's', description: 'Stop current service' },
      { key: 'a', description: 'Start current service' },
      { key: 'R', description: 'Restart all services' },
    ],
  },
  {
    title: 'General',
    commands: [
      { key: '?', description: 'Show this help' },
      { key: 'q / Ctrl+C', description: 'Quit' },
    ],
  },
];

export function HelpPopup({ onClose, width, height }: HelpPopupProps) {
  const [search, setSearch] = useState('');

  useInput((input, key) => {
    // Close on escape
    if (key.escape) {
      onClose();
      return;
    }
    
    // Close on ? only when search is empty
    if (input === '?' && search === '') {
      onClose();
      return;
    }
    
    // Backspace to delete
    if (key.backspace || key.delete) {
      setSearch(s => s.slice(0, -1));
      return;
    }
    
    // Add printable characters to search
    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setSearch(s => s + input);
      return;
    }
  });

  // Filter commands based on search
  const searchLower = search.toLowerCase();
  const filteredGroups = COMMAND_GROUPS.map(group => ({
    ...group,
    commands: group.commands.filter(
      cmd => 
        cmd.key.toLowerCase().includes(searchLower) ||
        cmd.description.toLowerCase().includes(searchLower)
    ),
  })).filter(group => group.commands.length > 0);

  const maxKeyWidth = Math.max(
    ...COMMAND_GROUPS.flatMap(g => g.commands.map(c => c.key.length))
  );

  // Calculate fixed width based on longest command line
  // Format: key (padded) + gap (2) + description
  const maxDescriptionWidth = Math.max(
    ...COMMAND_GROUPS.flatMap(g => g.commands.map(c => c.description.length))
  );
  // Content width: key column + gap + description
  // Add padding (2*2=4) and border (2) for the box
  const contentWidth = maxKeyWidth + 2 + maxDescriptionWidth;
  const boxWidth = contentWidth + 4 + 2;

  // Calculate fixed height for command list area
  // Each group: title (1) + commands + margin (1, except last)
  const totalCommands = COMMAND_GROUPS.reduce((sum, g) => sum + g.commands.length, 0);
  const groupTitles = COMMAND_GROUPS.length;
  const groupMargins = COMMAND_GROUPS.length - 1;
  const commandListHeight = totalCommands + groupTitles + groupMargins;

  // Create backdrop lines to fill the screen
  const backdropLine = ' '.repeat(width);

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Backdrop layer */}
      <Box 
        position="absolute" 
        flexDirection="column" 
        width={width} 
        height={height}
      >
        {Array.from({ length: height }).map((_, i) => (
          <Text key={i} backgroundColor="black">{backdropLine}</Text>
        ))}
      </Box>
      
      {/* Centered content */}
      <Box
        position="absolute"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width={width}
        height={height}
      >
        <Box
          flexDirection="column"
          borderStyle="double"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
          width={boxWidth}
        >
          <Box justifyContent="center" marginBottom={1}>
            <Text bold color="cyan">Keyboard Shortcuts</Text>
          </Box>

          {/* Search input */}
          <Box marginBottom={1}>
            <Text dimColor>Search: </Text>
            <Text color="white">{search}</Text>
            <Text color="cyan">▌</Text>
          </Box>

          {/* Fixed height container for command list */}
          <Box flexDirection="column" height={commandListHeight}>
            {filteredGroups.length === 0 ? (
              <Box justifyContent="center" paddingY={1}>
                <Text dimColor>No matching commands</Text>
              </Box>
            ) : (
              filteredGroups.map((group, groupIndex) => (
                <Box key={group.title} flexDirection="column" marginBottom={groupIndex < filteredGroups.length - 1 ? 1 : 0}>
                  <Text bold underline color="white">{group.title}</Text>
                  {group.commands.map(({ key, description }) => (
                    <Box key={key} gap={2}>
                      <Box width={maxKeyWidth + 2}>
                        <Text bold color="yellow">{key.padEnd(maxKeyWidth)}</Text>
                      </Box>
                      <Text dimColor>{description}</Text>
                    </Box>
                  ))}
                </Box>
              ))
            )}
          </Box>

          <Box justifyContent="center" marginTop={1}>
            <Text dimColor>Esc to close</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
