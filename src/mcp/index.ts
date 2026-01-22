/**
 * MCP module exports
 */
export { startMcpServer, McpServer } from './server.js';
export { StateWriter } from './state-writer.js';
export {
  readState,
  writeState,
  removeState,
  findProjectRoot,
  findStateForCurrentDir,
  getStateFilePath,
  type SpinState,
} from './state.js';
export {
  detectMcpTargets,
  installMcpServer,
  uninstallMcpServer,
  isSpinMcpInstalled,
  autoInstallMcp,
  getTargetDisplayName,
} from './installer.js';
export type { McpTarget, McpServerOptions, ServiceInfo, LogEntry } from './types.js';
