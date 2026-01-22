/**
 * MCP-specific types for spin
 */

/**
 * Represents a target location where MCP server config can be installed
 */
export interface McpTarget {
  /** Type of target */
  type: 'cursor-global' | 'cursor-project' | 'claude-desktop';
  /** Full path to the config file */
  configPath: string;
  /** Whether the config file already exists */
  exists: boolean;
}

/**
 * MCP server configuration options
 */
export interface McpServerOptions {
  /** Port to listen on (default: 9847) */
  port?: number;
}

/**
 * Service info returned by MCP tools
 */
export interface ServiceInfo {
  /** Service ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Current status */
  status: 'stopped' | 'starting' | 'running' | 'error';
  /** Description from config */
  description?: string;
  /** Error message if status is 'error' */
  error?: string;
  /** When the service was started */
  startedAt?: string;
}

/**
 * Log entry returned by get_logs tool
 */
export interface LogEntry {
  /** The log line content */
  line: string;
  /** Which stream this came from */
  stream: 'stdout' | 'stderr';
}
