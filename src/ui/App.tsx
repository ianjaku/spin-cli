import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, useApp, useInput } from 'ink';
import { useScreenSize } from 'fullscreen-ink';
import { StatusBar } from './StatusBar.js';
import { LogViewer } from './LogViewer.js';
import { CommandBar } from './CommandBar.js';
import { HelpPopup } from './HelpPopup.js';
import { CommandPalette } from './CommandPalette.js';
import { OutputOverlay } from './OutputOverlay.js';
import { RunnableManager } from '../runnables/manager.js';
import { ScriptRegistry } from '../scripts/registry.js';
import { ScriptRunner } from '../scripts/runner.js';
import { CommandHistory } from '../scripts/history.js';
import { defaultShellCommands } from '../scripts/helpers.js';
import type { RunnableInstance } from '../types.js';

type AppMode = 'normal' | 'help' | 'palette' | 'output';

interface AppProps {
  manager: RunnableManager;
  registry: ScriptRegistry;
  shellCommands?: string[];
}

export function App({ manager, registry, shellCommands = defaultShellCommands }: AppProps) {
  const { exit } = useApp();
  const { height, width } = useScreenSize();
  
  const [instances, setInstances] = useState<RunnableInstance[]>(manager.getAll());
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState<string>();
  const [mode, setMode] = useState<AppMode>('normal');
  
  // Script runner and history
  const [scriptRunner] = useState(() => new ScriptRunner());
  const [history] = useState(() => {
    const h = new CommandHistory();
    h.load();
    return h;
  });
  
  // Output state
  const [outputCommand, setOutputCommand] = useState('');
  const [outputCwd, setOutputCwd] = useState('');
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [outputDuration, setOutputDuration] = useState(0);
  const [outputExitCode, setOutputExitCode] = useState<number | null>(null);
  
  const activeInstance = instances[activeIndex] ?? null;
  const activeId = activeInstance?.id ?? null;
  
  // Get cwd for ad-hoc commands (from active runnable or process.cwd)
  const paletteCwd = useMemo(() => {
    return activeInstance?.definition.cwd || process.cwd();
  }, [activeInstance]);
  
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
  
  // Subscribe to script runner events
  useEffect(() => {
    const handleOutput = (line: string) => {
      setOutputLines(prev => [...prev, line]);
    };
    
    const handleExit = (code: number | null) => {
      setOutputExitCode(code);
      setOutputDuration(scriptRunner.duration);
    };
    
    scriptRunner.on('output', handleOutput);
    scriptRunner.on('exit', handleExit);
    
    return () => {
      scriptRunner.off('output', handleOutput);
      scriptRunner.off('exit', handleExit);
    };
  }, [scriptRunner]);
  
  // Update duration while running
  useEffect(() => {
    if (mode === 'output' && scriptRunner.isRunning()) {
      const interval = setInterval(() => {
        setOutputDuration(scriptRunner.duration);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [mode, scriptRunner]);
  
  // Show temporary message
  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(undefined), 2000);
  }, []);
  
  // Open command palette
  const openPalette = useCallback(async () => {
    // Initialize registry on first open (lazy loading)
    if (!registry.isInitialized()) {
      await registry.init();
    }
    setMode('palette');
  }, [registry]);
  
  // Handle running a command from palette
  const handleRunCommand = useCallback((command: string, cwd: string) => {
    // Add to history
    history.add(command);
    
    // Reset output state
    setOutputCommand(command);
    setOutputCwd(cwd);
    setOutputLines([]);
    setOutputExitCode(null);
    setOutputDuration(0);
    
    // Switch to output mode
    setMode('output');
    
    // Run the command
    scriptRunner.run(command, cwd);
  }, [history, scriptRunner]);
  
  // Handle rerunning a command
  const handleRerun = useCallback(() => {
    setOutputLines([]);
    setOutputExitCode(null);
    setOutputDuration(0);
    scriptRunner.run(outputCommand, outputCwd);
  }, [scriptRunner, outputCommand, outputCwd]);
  
  // Handle closing output overlay
  const handleCloseOutput = useCallback(() => {
    setMode('normal');
    scriptRunner.reset();
  }, [scriptRunner]);
  
  // Handle canceling running command
  const handleCancel = useCallback(() => {
    scriptRunner.cancel();
  }, [scriptRunner]);
  
  // Search scripts callback
  const handleSearch = useCallback((query: string) => {
    return registry.search(query);
  }, [registry]);
  
  // Handle keyboard input
  useInput((input, key) => {
    // Only handle in normal mode
    if (mode !== 'normal') return;
    
    // : - open command palette
    if (input === ':') {
      openPalette();
      return;
    }
    
    // ? - toggle help popup
    if (input === '?') {
      setMode('help');
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
        isActive={mode === 'normal'}
      />
      
      {/* Command bar at bottom */}
      <CommandBar message={message} />
      
      {/* Help popup overlay */}
      {mode === 'help' && (
        <Box 
          position="absolute" 
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          height={height}
          width={width}
        >
          <HelpPopup onClose={() => setMode('normal')} width={width} height={height} />
        </Box>
      )}
      
      {/* Command palette overlay */}
      {mode === 'palette' && (
        <Box 
          position="absolute" 
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          height={height}
          width={width}
        >
          <CommandPalette
            scripts={registry.getAll()}
            shellCommands={shellCommands}
            history={history.getAll()}
            cwd={paletteCwd}
            width={width}
            height={height}
            onRun={handleRunCommand}
            onClose={() => setMode('normal')}
            onSearch={handleSearch}
          />
        </Box>
      )}
      
      {/* Output overlay */}
      {mode === 'output' && (
        <Box 
          position="absolute" 
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          height={height}
          width={width}
        >
          <OutputOverlay
            command={outputCommand}
            cwd={outputCwd}
            output={outputLines}
            status={scriptRunner.status}
            exitCode={outputExitCode}
            duration={outputDuration}
            width={width}
            height={height}
            onClose={handleCloseOutput}
            onRerun={handleRerun}
            onCancel={handleCancel}
          />
        </Box>
      )}
    </Box>
  );
}
