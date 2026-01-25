import React from "react";
import { Box, Text } from "ink";

interface CommandBarProps {
  message?: string;
  backgroundScriptsCount?: number;
}

/** Renders a key + description hint */
function Hint({ keyName, desc }: { keyName: string; desc: string }) {
  return (
    <Box>
      <Text backgroundColor="#1a1a1a" dimColor>{` ${keyName} `}</Text>
      <Text dimColor> {desc}</Text>
    </Box>
  );
}

export function CommandBar({ message, backgroundScriptsCount = 0 }: CommandBarProps) {
  return (
    <Box paddingX={2} justifyContent="space-between">
      <Box gap={2}>
        <Hint keyName="1-9" desc="switch" />
        <Hint keyName="j/k" desc="scroll" />
        <Hint keyName="r" desc="restart" />
        <Hint keyName=":" desc="run" />
        {backgroundScriptsCount > 0 && <Hint keyName="b" desc={`bg (${backgroundScriptsCount})`} />}
        <Hint keyName="?" desc="help" />
        <Hint keyName="q" desc="quit" />
      </Box>
      {message && <Text color="yellow">{message}</Text>}
    </Box>
  );
}
