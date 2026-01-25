import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { useScreenSize } from "fullscreen-ink";
import { StatusBar } from "./StatusBar.js";
import { LogViewer } from "./LogViewer.js";
import { CommandBar } from "./CommandBar.js";
import { HelpPopup } from "./HelpPopup.js";
import { CommandPalette } from "./CommandPalette.js";
import { OutputOverlay } from "./OutputOverlay.js";
import { BackgroundScriptsList } from "./BackgroundScriptsList.js";
import { BackgroundLogViewer } from "./BackgroundLogViewer.js";
import { RunnableManager } from "../runnables/manager.js";
import { ScriptRegistry } from "../scripts/registry.js";
import { ScriptRunner } from "../scripts/runner.js";
import { CommandHistory } from "../scripts/history.js";
import { defaultShellCommands } from "../scripts/helpers.js";
import type { BackgroundScript } from "../types.js";
import {
  createManagerStore,
  ManagerStoreProvider,
} from "../state/managerStore.js";

type AppMode = "normal" | "help" | "palette" | "output" | "background-list";

interface AppProps {
  manager: RunnableManager;
  registry: ScriptRegistry;
  shellCommands?: string[];
}

export function App({
  manager,
  registry,
  shellCommands = defaultShellCommands,
}: AppProps) {
  const { exit } = useApp();
  const { height, width } = useScreenSize();

  const [managerStore] = useState(() => createManagerStore(manager));
  const instances = managerStore.useStore((state) => state.instances);
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState<string>();
  const [mode, setMode] = useState<AppMode>("normal");

  // Script runner (created fresh for each command) and history
  const [scriptRunner, setScriptRunner] = useState<ScriptRunner | null>(null);
  const [history] = useState(() => {
    const h = new CommandHistory();
    h.load();
    return h;
  });

  // Output state (for foreground script in output mode)
  const [outputCommand, setOutputCommand] = useState("");
  const [outputCwd, setOutputCwd] = useState("");
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [outputDuration, setOutputDuration] = useState(0);
  const [outputExitCode, setOutputExitCode] = useState<number | null>(null);

  // Background scripts state
  const [backgroundScripts, setBackgroundScripts] = useState<BackgroundScript[]>([]);
  const backgroundRunnersRef = useRef<Map<string, ScriptRunner>>(new Map());

  // Compute total tabs: services + background scripts
  const totalTabs = instances.length + backgroundScripts.length;

  // Determine what's active: service or background script
  const isBackgroundActive = activeIndex >= instances.length;
  const activeInstance = isBackgroundActive ? null : (instances[activeIndex] ?? null);
  const activeId = activeInstance?.id ?? null;
  const activeBackgroundScript = isBackgroundActive
    ? backgroundScripts[activeIndex - instances.length] ?? null
    : null;

  // Get cwd for ad-hoc commands (from active runnable or process.cwd)
  const paletteCwd = useMemo(() => {
    return activeInstance?.definition.cwd || process.cwd();
  }, [activeInstance]);

  useEffect(() => {
    return () => managerStore.dispose();
  }, [managerStore]);

  // Subscribe to script runner events
  useEffect(() => {
    if (!scriptRunner) return;

    const handleOutput = (line: string) => {
      setOutputLines((prev) => [...prev, line]);
    };

    const handleExit = (code: number | null) => {
      setOutputExitCode(code);
      setOutputDuration(scriptRunner.duration);
    };

    scriptRunner.on("output", handleOutput);
    scriptRunner.on("exit", handleExit);

    return () => {
      scriptRunner.off("output", handleOutput);
      scriptRunner.off("exit", handleExit);
    };
  }, [scriptRunner]);

  // Update duration while running
  useEffect(() => {
    if (mode === "output" && scriptRunner?.isRunning()) {
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
    setMode("palette");
  }, [registry]);

  // Handle running a command from palette
  const handleRunCommand = useCallback(
    (command: string, cwd: string) => {
      // Add to history
      history.add(command);

      // Reset output state
      setOutputCommand(command);
      setOutputCwd(cwd);
      setOutputLines([]);
      setOutputExitCode(null);
      setOutputDuration(0);

      // Create a fresh runner for this command
      const runner = new ScriptRunner();
      setScriptRunner(runner);

      // Switch to output mode
      setMode("output");

      // Run the command
      runner.run(command, cwd);
    },
    [history],
  );

  // Handle rerunning a command
  const handleRerun = useCallback(() => {
    setOutputLines([]);
    setOutputExitCode(null);
    setOutputDuration(0);
    
    // Create a fresh runner for rerun
    const runner = new ScriptRunner();
    setScriptRunner(runner);
    runner.run(outputCommand, outputCwd);
  }, [outputCommand, outputCwd]);

  // Handle closing output overlay
  const handleCloseOutput = useCallback(() => {
    setMode("normal");
    scriptRunner?.cancel(); // Cancel if still running
    setScriptRunner(null);
  }, [scriptRunner]);

  // Handle canceling running command
  const handleCancel = useCallback(() => {
    scriptRunner?.cancel();
  }, [scriptRunner]);

  // Handle minimizing current output to background
  const handleMinimize = useCallback(() => {
    if (!scriptRunner) return;

    const id = `bg-${Date.now()}`;
    
    // Create background script entry
    const bgScript: BackgroundScript = {
      id,
      command: outputCommand,
      cwd: outputCwd,
      output: [...outputLines],
      status: scriptRunner.status === 'running' ? 'running' : 
              scriptRunner.status === 'success' ? 'success' : 'error',
      exitCode: outputExitCode,
      duration: outputDuration,
      startedAt: Date.now() - outputDuration,
    };

    // Remove existing listeners (they're for the foreground state updates)
    scriptRunner.removeAllListeners();

    // Transfer the runner to background
    backgroundRunnersRef.current.set(id, scriptRunner);

    // Subscribe to updates for this background script
    const handleOutput = (line: string) => {
      setBackgroundScripts(prev => prev.map(s => 
        s.id === id ? { ...s, output: [...s.output, line] } : s
      ));
    };

    const handleExit = (code: number | null) => {
      const runner = backgroundRunnersRef.current.get(id);
      const status = code === 0 ? 'success' : 'error';
      setBackgroundScripts(prev => prev.map(s => 
        s.id === id ? { 
          ...s, 
          status, 
          exitCode: code, 
          duration: runner?.duration ?? s.duration 
        } : s
      ));
      // Show notification
      const cmd = bgScript.command.length > 30 
        ? bgScript.command.slice(0, 27) + '...' 
        : bgScript.command;
      showMessage(status === 'success' ? `✓ ${cmd}` : `✗ ${cmd} (exit ${code})`);
    };

    scriptRunner.on('output', handleOutput);
    scriptRunner.on('exit', handleExit);

    // Add to background scripts
    setBackgroundScripts(prev => [...prev, bgScript]);

    // Clear foreground runner (new one will be created on next command)
    setScriptRunner(null);

    // Close output overlay and go back to normal
    setMode("normal");
  }, [outputCommand, outputCwd, outputLines, outputExitCode, outputDuration, scriptRunner, showMessage]);

  // Handle restoring a background script to view
  const handleRestoreScript = useCallback((id: string) => {
    const script = backgroundScripts.find(s => s.id === id);
    if (!script) return;

    const runner = backgroundRunnersRef.current.get(id);

    // Set output state from background script
    setOutputCommand(script.command);
    setOutputCwd(script.cwd);
    setOutputLines(script.output);
    setOutputExitCode(script.exitCode);
    setOutputDuration(script.duration);

    // Remove from background
    setBackgroundScripts(prev => prev.filter(s => s.id !== id));
    backgroundRunnersRef.current.delete(id);

    // If still running, transfer the runner back
    if (runner && script.status === 'running') {
      // Remove old listeners and add new ones
      runner.removeAllListeners();
      
      runner.on('output', (line: string) => {
        setOutputLines(prev => [...prev, line]);
      });
      
      runner.on('exit', (code: number | null) => {
        setOutputExitCode(code);
        setOutputDuration(runner.duration);
      });
    }

    setMode("output");
  }, [backgroundScripts]);

  // Handle dismissing a completed background script
  const handleDismissScript = useCallback((id: string) => {
    setBackgroundScripts(prev => prev.filter(s => s.id !== id));
    backgroundRunnersRef.current.delete(id);
  }, []);

  // Handle canceling a background script
  const handleCancelBackgroundScript = useCallback((id: string) => {
    const runner = backgroundRunnersRef.current.get(id);
    if (runner) {
      runner.cancel();
    }
  }, []);

  // Search scripts callback
  const handleSearch = useCallback(
    (query: string) => {
      return registry.search(query);
    },
    [registry],
  );

  // Handle keyboard input
  useInput((input, key) => {
    // Only handle in normal mode
    if (mode !== "normal") return;

    // : - open command palette
    if (input === ":") {
      openPalette();
      return;
    }

    // ? - toggle help popup
    if (input === "?") {
      setMode("help");
      return;
    }

    // Number keys 1-9 to switch services
    const num = parseInt(input);
    if (num >= 1 && num <= 9 && num <= instances.length) {
      setActiveIndex(num - 1);
      return;
    }

    // Tab to cycle through services and background scripts
    if (key.tab) {
      if (totalTabs > 0) {
        setActiveIndex((i) => (i + 1) % totalTabs);
      }
      return;
    }

    // Shift+Tab to cycle backwards
    if (key.shift && key.tab) {
      if (totalTabs > 0) {
        setActiveIndex((i) => (i - 1 + totalTabs) % totalTabs);
      }
      return;
    }

    // r - restart current service
    if (input === "r" && activeId) {
      manager.restart(activeId);
      showMessage(`Restarting ${activeId}...`);
      return;
    }

    // s - stop current service
    if (input === "s" && activeId) {
      manager.stop(activeId);
      showMessage(`Stopping ${activeId}...`);
      return;
    }

    // a - start current service
    if (input === "a" && activeId) {
      manager.start(activeId);
      showMessage(`Starting ${activeId}...`);
      return;
    }

    // R - restart all services
    if (input === "R") {
      for (const instance of instances) {
        manager.restart(instance.id);
      }
      showMessage("Restarting all services...");
      return;
    }

    // b - open background scripts list (only if there are background scripts)
    if (input === "b" && backgroundScripts.length > 0) {
      setMode("background-list");
      return;
    }

    // q or Ctrl+C - quit
    if (input === "q" || (key.ctrl && input === "c")) {
      // Cancel all background scripts
      for (const [, runner] of backgroundRunnersRef.current) {
        runner.cancel();
      }
      manager.stopAll().then(() => {
        exit();
      });
      return;
    }
  });

  // Calculate available height for log viewer
  // Status bar: 2 lines (tabs + separator), Command bar: 1 line
  const logViewerHeight = Math.max(5, height - 3);

  return (
    <ManagerStoreProvider store={managerStore}>
      <Box flexDirection="column" height={height} width={width}>
        {/* Status bar at top */}
        <StatusBar 
          instances={instances} 
          activeId={activeId} 
          backgroundScripts={backgroundScripts}
          activeBackgroundId={activeBackgroundScript?.id ?? null}
          width={width} 
        />

        {/* Log viewer takes remaining space */}
        {activeBackgroundScript ? (
          <BackgroundLogViewer
            script={activeBackgroundScript}
            height={logViewerHeight}
            width={width}
            isActive={mode === "normal"}
            onCancel={() => handleCancelBackgroundScript(activeBackgroundScript.id)}
            onDismiss={() => handleDismissScript(activeBackgroundScript.id)}
          />
        ) : (
          <LogViewer
            instance={activeInstance}
            manager={manager}
            height={logViewerHeight}
            width={width}
            isActive={mode === "normal"}
          />
        )}

        {/* Command bar at bottom */}
        <CommandBar message={message} backgroundScriptsCount={backgroundScripts.length} />

        {/* Help popup overlay */}
        {mode === "help" && (
          <Box
            position="absolute"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            height={height}
            width={width}
          >
            <HelpPopup
              onClose={() => setMode("normal")}
              width={width}
              height={height}
            />
          </Box>
        )}

        {/* Command palette overlay */}
        {mode === "palette" && (
          <Box
            flexDirection="column"
            width={width}
            height={height}
            position="absolute"
          >
            {/* Backdrop layer */}
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
            >
              <CommandPalette
                scripts={registry.getAll()}
                shellCommands={shellCommands}
                history={history.getAll()}
                cwd={paletteCwd}
                width={width}
                height={height}
                onRun={handleRunCommand}
                onClose={() => setMode("normal")}
                onSearch={handleSearch}
              />
            </Box>
          </Box>
        )}

        {/* Output overlay */}
        {mode === "output" && (
          <Box
            flexDirection="column"
            width={width}
            height={height}
            position="absolute"
          >
            {/* Backdrop layer */}
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
            >
              <OutputOverlay
                command={outputCommand}
                cwd={outputCwd}
                output={outputLines}
                status={scriptRunner?.status ?? 'idle'}
                exitCode={outputExitCode}
                duration={outputDuration}
                width={width}
                height={height}
                onClose={handleCloseOutput}
                onRerun={handleRerun}
                onCancel={handleCancel}
                onMinimize={handleMinimize}
              />
            </Box>
          </Box>
        )}

        {/* Background scripts list overlay */}
        {mode === "background-list" && (
          <Box
            flexDirection="column"
            width={width}
            height={height}
            position="absolute"
          >
            {/* Backdrop layer */}
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
            >
              <BackgroundScriptsList
                scripts={backgroundScripts}
                width={width}
                height={height}
                onClose={() => setMode("normal")}
                onRestore={handleRestoreScript}
                onDismiss={handleDismissScript}
                onCancel={handleCancelBackgroundScript}
              />
            </Box>
          </Box>
        )}
      </Box>
    </ManagerStoreProvider>
  );
}
