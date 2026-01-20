# Technical Specifications

## Overview

**easy-cli** is a TypeScript library for building interactive, full-screen terminal applications with multiple log streams, service management, and vim-style navigation.

---

## Core Technology Stack

### Primary: Ink Ecosystem

| Package | Version | Purpose |
|---------|---------|---------|
| `ink` | ^5.x | Core React-for-terminals renderer |
| `fullscreen-ink` | ^1.x | Alternate screen buffer, responsive resizing |
| `@inkjs/ui` | ^2.x | Pre-built UI components |
| `react` | ^18.x | Required peer dependency for Ink |

### Why Ink?

1. **React Mental Model**
   - Components, hooks, state management work exactly like React
   - Familiar to most modern TypeScript developers
   - Enables composition and reusability

2. **Flexbox Layouts**
   - Native flexbox support via Yoga layout engine
   - Intuitive responsive layouts without absolute positioning
   - Easy to create multi-pane interfaces

3. **First-Class TypeScript Support**
   - Full type definitions included
   - Excellent IDE autocomplete and type checking

4. **Active Maintenance**
   - Maintained by Vadim Demedes
   - Regular updates and bug fixes
   - Growing ecosystem of plugins

5. **Battle-Tested**
   - Used by Claude Code (Anthropic)
   - Used by Gatsby, Prisma, and other major tools

### Alternatives Considered

| Library | Pros | Cons | Decision |
|---------|------|------|----------|
| blessed/neo-blessed | Powerful widgets, mouse support | Old API, less maintained, steep learning curve | Rejected |
| terminal-kit | Full-featured | Less composable, not React-based | Rejected |
| vorpal | Good for command-based CLIs | Not suitable for TUI apps | Rejected |

---

## Architecture Principles

### 1. Layered Architecture

```
┌─────────────────────────────────────────┐
│           Application Layer             │  ← User's CLI app
├─────────────────────────────────────────┤
│            easy-cli Library             │  ← This library
├─────────────────────────────────────────┤
│     Ink + fullscreen-ink + ink-ui       │  ← Foundation
├─────────────────────────────────────────┤
│           React + Node.js               │  ← Runtime
└─────────────────────────────────────────┘
```

### 2. Component-Based Design

- **Primitives**: Low-level building blocks (LogStream, StatusBadge, KeyHandler)
- **Composites**: Higher-level components built from primitives (ServicePanel, LogViewer)
- **Layouts**: Full-screen layouts and navigation patterns (TabbedLayout, SplitPane)

### 3. Hooks-First API

Expose functionality through React hooks for maximum flexibility:

```typescript
// Process management
const { start, stop, restart, status } = useProcess(config);

// Log streaming
const { logs, clear, filter } = useLogStream(process);

// Keyboard navigation
const { focused, navigate } = useFocusManager();
```

---

## Key Technical Features

### Process Management

- Spawn and manage child processes (`child_process.spawn`)
- Capture stdout/stderr streams
- Handle process lifecycle (start, stop, restart, crash recovery)
- Support for npm scripts, arbitrary commands

### Log Streaming

- Real-time log capture from multiple processes
- Circular buffer for memory efficiency
- Log filtering and search
- ANSI color preservation
- Scrollback with vim-style navigation

### Input Handling

- Global keyboard shortcuts
- Context-aware key bindings
- Modal input states (normal, command, search)
- vim-style navigation (j/k/g/G/ctrl+d/ctrl+u)

### Layout System

- Responsive to terminal resize
- Split panes (horizontal/vertical)
- Tabbed views
- Focus management between panes
- Status bar / command bar at bottom

---

## Build & Distribution

### Build Tools

- **TypeScript** for source code
- **tsup** or **unbuild** for bundling (ESM + CJS)
- **Vitest** for testing
- **Changesets** for versioning

### Package Output

```
dist/
├── index.js          # ESM entry
├── index.cjs         # CJS entry
├── index.d.ts        # Type definitions
└── components/       # Tree-shakeable exports
```

### Peer Dependencies

```json
{
  "peerDependencies": {
    "react": "^18.0.0",
    "ink": "^5.0.0"
  }
}
```

---

## Performance Considerations

1. **Memory Management**
   - Circular log buffers with configurable size
   - Cleanup on component unmount
   - Efficient re-renders with React.memo

2. **Render Optimization**
   - Batch log updates (requestAnimationFrame pattern)
   - Virtual scrolling for large log outputs
   - Debounced resize handling

3. **Process Handling**
   - Proper cleanup on exit (SIGINT, SIGTERM)
   - Graceful shutdown of child processes
   - No zombie processes

---

## Testing Strategy

1. **Unit Tests**: Individual hooks and utilities
2. **Component Tests**: Ink's built-in testing utilities
3. **Integration Tests**: Full app scenarios with mock processes
4. **Manual Testing**: Real terminal environments (iTerm, Terminal.app, Windows Terminal)
