# MCP Logs Context Tool

## Problem

When users run `spin dev` in Cursor and select logs to "Add to chat", Cursor identifies the source as a generic "node" process. The AI has no way to know which service the logs came from, making it harder to provide relevant help.

## Solution

Add a `get_logs_context` MCP tool that allows the AI to search for log snippets and discover:

- Which service produced the logs
- Surrounding context (lines before/after)
- How often the pattern appeared
- Service status and metadata

This turns a Cursor limitation into a feature - the AI actively investigates rather than passively receiving decontextualized text.

## Tool Design

### Input Schema

```typescript
{
  name: 'get_logs_context',
  description: 'Find which service produced a log snippet and get surrounding context. Use this when the user shares logs to understand where they came from.',
  inputSchema: {
    type: 'object',
    properties: {
      log_snippet: {
        type: 'string',
        description: 'The log text to search for (can be partial, multi-line supported)',
      },
      context_lines: {
        type: 'number',
        description: 'Number of lines before/after matches to include (default: 10)',
      },
      max_matches: {
        type: 'number',
        description: 'Maximum number of matches to include. (latest first) (default: 5)'
      }
    },
    required: ['log_snippet'],
  },
}
```

### Example Response

Plain text optimized for AI comprehension (not JSON - the AI doesn't need structured data, it needs readable context):

```
Service: next (running)
Found 1 match

--- Context (2 min ago) ---
[10:30:01] ▲ Next.js 16.1.1 (Turbopack)
[10:30:01] - Local: http://localhost:3000
[10:30:02] >>> Error: Connection refused <<<
[10:30:02] - Retrying in 5s...
[10:30:07] - Connected to database
```

For multiple matches (including across different services), show unified timeline sorted by recency:

```
Found 3 matches across 2 services

--- Match 1: api (2 min ago) ---
[10:45:01] Processing request...
[10:45:02] >>> Connection timeout <<<
[10:45:02] Retrying...

--- Match 2: next (3 min ago) ---
[10:44:15] Fetching data from api...
[10:44:16] >>> Connection timeout <<<
[10:44:16] Render failed

--- Match 3: api (15 min ago) ---
[10:32:11] Processing request...
[10:32:12] >>> Connection timeout <<<
[10:32:15] Recovered
```

This lets the AI see causality across services (e.g., "api timed out, then next crashed 1 second later").

## Use Cases

1. **Error investigation** - User pastes an error, AI finds the service and sees what happened before/after
2. **Pattern detection** - AI can check if an error is recurring by seeing occurrence count
3. **Cross-service correlation** - AI can search multiple services to find related events
4. **Historical context** - See if the issue started after a restart, etc.

## Implementation Notes

### State Requirements

The current `SpinState` stores logs per service:

```typescript
logs: Record<string, string[]>; // currently 100 lines per service
```

**Changes needed:**
- Increase limit from 100 → 3000 lines
- Store timestamps with each line (for recency-based relevance when multiple matches exist)

### Search Strategy

1. Normalize the input snippet (trim whitespace, handle ANSI codes)
2. Search each service's log buffer for matches
3. For partial matches, use substring search
4. For multi-line snippets, search for consecutive line matches
5. Return context around each match

### Edge Cases

- Log snippet appears in multiple services → return all matches
- No match found → return helpful message ("log not found, spin may have restarted")
- Very common pattern (e.g., "200 OK") → limit results, suggest more specific search

## Future Enhancements

- **Timestamps** - Store timestamps with each log line for time-based queries
- **Log levels** - Parse log levels (ERROR, WARN, INFO) for filtered searches
- **Regex support** - Allow pattern matching for advanced users
- **Streaming** - For very long context, stream results back

## Alternatives Considered

1. **Prefix every log line with service name** - Rejected: ugly in the TUI when you're already in a service tab
2. **Track focused service** - Works but has race condition if user switches tabs
3. **Write logs to files** - Changes workflow, users would need to open files instead of copying from TUI
