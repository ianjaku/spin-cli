import React from "react";
import { Box, Text, useInput } from "ink";

interface HelpPopupProps {
  onClose: () => void;
  width: number;
  height: number;
}

const COMMANDS = [
  { key: "1-9", desc: "switch service" },
  { key: "tab", desc: "next service" },
  { key: "S-tab", desc: "prev service" },
  { key: "j/k", desc: "scroll" },
  { key: "g/G", desc: "top/bottom" },
  { key: "f", desc: "follow mode" },
  { key: ":", desc: "run command" },
  { key: "r", desc: "restart" },
  { key: "s", desc: "start service" },
  { key: "x", desc: "stop" },
  { key: "a", desc: "start" },
  { key: "R", desc: "restart all" },
  { key: "q", desc: "quit" },
];

export function HelpPopup({ onClose, width, height }: HelpPopupProps) {
  useInput((input, key) => {
    if (key.escape || input === "?" || key.return) {
      onClose();
    }
  });

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      position="absolute"
    >
      {/* Backdrop */}
      <Box
        position="absolute"
        flexDirection="column"
        width={width}
        height={height}
      >
        {Array.from({ length: height }).map((_, i) => (
          <Text key={i} backgroundColor="black">
            {" ".repeat(width)}
          </Text>
        ))}
      </Box>

      {/* Content */}
      <Box
        position="absolute"
        flexDirection="column"
        width={width}
        height={height}
        paddingX={2}
        paddingY={1}
      >
        <Box marginBottom={1}>
          <Text bold>keyboard shortcuts</Text>
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          {COMMANDS.map(({ key, desc }) => (
            <Box key={key}>
              <Text dimColor>{key.padEnd(8)}</Text>
              <Text>{desc}</Text>
            </Box>
          ))}
        </Box>

        <Box>
          <Text dimColor>esc close</Text>
        </Box>
      </Box>
    </Box>
  );
}
