import React, { useState, useEffect, useCallback } from 'react';
import { Box, useApp, useInput } from 'ink';
import { useScreenSize } from 'fullscreen-ink';
import { StatusBar } from './StatusBar.js';
import { LogViewer } from './LogViewer.js';
import { CommandBar } from './CommandBar.js';
import { HelpPopup } from './HelpPopup.js';
import { RunnableManager } from '../runnables/manager.js';
import type { RunnableInstance } from '../types.js';

interface AppProps {
  manager: RunnableManager;
}

export function App({ manager }: AppProps) {
  const { exit } = useApp();
  const { height, width } = useScreenSize();
  
  const [instances, setInstances] = useState<RunnableInstance[]>(manager.getAll());
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState<string>();
  const [showHelp, setShowHelp] = useState(false);
  
  const activeInstance = instances[activeIndex] ?? null;
  const activeId = activeInstance?.id ?? null;
  
  // Subscribe to manager events
  useEffect(() => {
    const updateInstances = () => {
      setInstances([...manager.getAll()]);
    };
    
    manager.on('status-change', updateInstances);
    manager.on('output', updateInstances);
    
    return () => {
      manager.off('status-change', updateInstances);
      manager.off('output', updateInstances);
    };
  }, [manager]);
  
  // Show temporary message
  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(undefined), 2000);
  }, []);
  
  // Handle keyboard input
  useInput((input, key) => {
    // Don't process other keys when help is open
    if (showHelp) return;
    
    // ? - toggle help popup
    if (input === '?') {
      setShowHelp(true);
      return;
    }
    
    // Number keys 1-9 to switch services
    const num = parseInt(input);
    if (num >= 1 && num <= 9 && num <= instances.length) {
      setActiveIndex(num - 1);
      return;
    }
    
    // Tab to cycle through services
    if (key.tab) {
      setActiveIndex(i => (i + 1) % instances.length);
      return;
    }
    
    // Shift+Tab to cycle backwards
    if (key.shift && key.tab) {
      setActiveIndex(i => (i - 1 + instances.length) % instances.length);
      return;
    }
    
    // r - restart current service
    if (input === 'r' && activeId) {
      manager.restart(activeId);
      showMessage(`Restarting ${activeId}...`);
      return;
    }
    
    // s - stop current service
    if (input === 's' && activeId) {
      manager.stop(activeId);
      showMessage(`Stopping ${activeId}...`);
      return;
    }
    
    // a - start current service
    if (input === 'a' && activeId) {
      manager.start(activeId);
      showMessage(`Starting ${activeId}...`);
      return;
    }
    
    // R - restart all services
    if (input === 'R') {
      for (const instance of instances) {
        manager.restart(instance.id);
      }
      showMessage('Restarting all services...');
      return;
    }
    
    // q or Ctrl+C - quit
    if (input === 'q' || (key.ctrl && input === 'c')) {
      manager.stopAll().then(() => {
        exit();
      });
      return;
    }
  });
  
  // Calculate available height for log viewer
  // Status bar: 1 line, Command bar: 2 lines (with border), padding: 1
  const logViewerHeight = Math.max(5, height - 4);
  
  return (
    <Box flexDirection="column" height={height} width={width}>
      {/* Status bar at top */}
      <StatusBar instances={instances} activeId={activeId} />
      
      {/* Log viewer takes remaining space */}
      <LogViewer 
        instance={activeInstance} 
        height={logViewerHeight}
        width={width}
        isActive={!showHelp}
      />
      
      {/* Command bar at bottom */}
      <CommandBar message={message} />
      
      {/* Help popup overlay */}
      {showHelp && (
        <Box 
          position="absolute" 
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          height={height}
          width={width}
        >
          <HelpPopup onClose={() => setShowHelp(false)} width={width} height={height} />
        </Box>
      )}
    </Box>
  );
}
