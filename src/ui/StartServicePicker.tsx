import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { RunnableInstance } from "../types.js";

interface StartServicePickerProps {
  hiddenServices: RunnableInstance[];
  width: number;
  height: number;
  onClose: () => void;
  onStart: (serviceId: string) => void;
}

export function StartServicePicker({
  hiddenServices,
  width,
  height,
  onClose,
  onStart,
}: StartServicePickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Get the selected service
  const selectedService = hiddenServices[selectedIndex];

  // Handle keyboard input
  useInput((input, key) => {
    // Escape to close/cancel
    if (key.escape) {
      onClose();
      return;
    }

    // Arrow up
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    // Arrow down
    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(hiddenServices.length - 1, i + 1));
      return;
    }

    // Enter to select - start immediately and close
    if (key.return && selectedService) {
      onStart(selectedService.id);
      return;
    }
  });

  // Calculate dimensions for the picker box
  const boxWidth = Math.min(40, width - 4);
  const boxHeight = Math.min(15, height - 4);
  const listHeight = boxHeight - 4; // Account for header and footer

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height={height}
      width={width}
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        width={boxWidth}
        paddingX={1}
      >
        {/* Header */}
        <Box marginBottom={1}>
          <Text bold>Start Service</Text>
        </Box>

        {/* Service selection list */}
        <Box flexDirection="column" height={listHeight}>
          {hiddenServices.slice(0, listHeight).map((service, index) => {
            const isSelected = index === selectedIndex;
            const name = service.definition.name || service.id;
            return (
              <Box key={service.id}>
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "> " : "  "}
                </Text>
                <Text bold={isSelected}>{name}</Text>
              </Box>
            );
          })}
          {hiddenServices.length > listHeight && (
            <Text dimColor>...and {hiddenServices.length - listHeight} more</Text>
          )}
        </Box>

        {/* Footer */}
        <Box marginTop={1}>
          <Text dimColor>[enter] select   [esc] cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
