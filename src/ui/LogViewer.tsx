import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RunnableManager } from '../runnables/manager.js';
import type { RunnableInstance } from '../types.js';
import { useManagerStore } from '../state/managerStore.js';

interface LogViewerProps {
  instance: RunnableInstance | null;
  manager: RunnableManager;
  height: number;
  width?: number;
  isActive: boolean;
}

export function LogViewer({ instance, manager, height, width, isActive }: LogViewerProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [followMode, setFollowMode] = useState(true);
  
  const outputTick = useManagerStore(state =>
    instance ? (state.outputTicks[instance.id] ?? 0) : 0
  );
  const lines = useMemo(() => {
    if (!instance) return [];
    return manager.getOutputLines(instance.id, 'all');
  }, [instance?.id, manager, outputTick]);
  const visibleLines = height - 2; // Account for border
  
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
    if (input === 'j' || key.downArrow) {
      setFollowMode(false);
      setScrollOffset(o => Math.min(o + 1, Math.max(0, lines.length - visibleLines)));
    }
    
    // k/up - scroll up
    if (input === 'k' || key.upArrow) {
      setFollowMode(false);
      setScrollOffset(o => Math.max(0, o - 1));
    }
    
    // ctrl+d - page down
    if (key.ctrl && input === 'd') {
      setFollowMode(false);
      setScrollOffset(o => Math.min(o + Math.floor(visibleLines / 2), Math.max(0, lines.length - visibleLines)));
    }
    
    // ctrl+u - page up
    if (key.ctrl && input === 'u') {
      setFollowMode(false);
      setScrollOffset(o => Math.max(0, o - Math.floor(visibleLines / 2)));
    }
    
    // g - go to top
    if (input === 'g') {
      setFollowMode(false);
      setScrollOffset(0);
    }
    
    // G - go to bottom
    if (input === 'G') {
      setFollowMode(true);
      setScrollOffset(Math.max(0, lines.length - visibleLines));
    }
    
    // f - toggle follow mode
    if (input === 'f') {
      setFollowMode(f => !f);
    }
  });
  
  if (!instance) {
    return (
      <Box 
        borderStyle="round" 
        flexGrow={1}
        width={width}
        flexDirection="column" 
        paddingX={1}
      >
        <Text dimColor>No service selected</Text>
      </Box>
    );
  }
  
  const displayLines = lines.slice(scrollOffset, scrollOffset + visibleLines);
  const serviceName = instance.definition.name || instance.id;
  
  return (
    <Box 
      borderStyle="round" 
      flexGrow={1} 
      width={width}
      flexDirection="column"
      borderColor={isActive ? 'blue' : undefined}
    >
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color={isActive ? 'blue' : undefined}>
          {serviceName}
        </Text>
        <Box gap={2}>
          {followMode && <Text color="green">[FOLLOW]</Text>}
          <Text dimColor>
            {lines.length > 0 
              ? `${scrollOffset + 1}-${Math.min(scrollOffset + visibleLines, lines.length)}/${lines.length}` 
              : '0/0'
            }
          </Text>
        </Box>
      </Box>
      
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {displayLines.length === 0 ? (
          <Text dimColor>Waiting for output...</Text>
        ) : (
          displayLines.map((line, i) => (
            <Text key={scrollOffset + i} wrap="truncate">
              {line}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}
