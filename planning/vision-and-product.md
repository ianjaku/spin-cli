# Vision & Product

## Mission

**easy-cli** makes it trivial to build beautiful, interactive terminal applications in TypeScript. Developers should be able to create powerful CLI tools—with multiple log streams, process management, and intuitive navigation—in minutes, not days.

---

## The Problem

Building interactive terminal UIs is hard:

1. **Low-level complexity**: Dealing with raw terminal escape codes, screen buffers, and cursor positioning
2. **Process management**: Spawning, monitoring, and gracefully shutting down multiple processes
3. **Log chaos**: Managing multiple output streams without them becoming an unreadable mess
4. **Poor UX patterns**: Most CLIs dump text and exit; few offer rich, interactive experiences
5. **Reinventing the wheel**: Every project rebuilds the same patterns

---

## The Solution

A high-level library that provides:

- **Ready-to-use components** for common CLI patterns
- **Process management** built-in
- **Log streaming** that "just works"
- **Keyboard navigation** with sensible defaults
- **Beautiful defaults** with full customization

---

## Target Users

1. **Primary**: TypeScript/JavaScript developers building dev tools
2. **Secondary**: Teams needing internal tooling (monorepo managers, deployment CLIs)
3. **Tertiary**: Open source maintainers creating CLI interfaces for their projects

---

## Core Features

### Phase 1: Foundation (MVP)

#### 1. Process Manager
- Start/stop/restart processes
- npm script integration (`npm run dev`, etc.)
- Process health monitoring (running, stopped, crashed)
- Graceful shutdown handling

#### 2. Log Viewer
- Real-time log streaming
- Scrollable with vim keybindings (j/k/g/G/ctrl+d/ctrl+u)
- ANSI color support
- Clear and filter capabilities

#### 3. Service Dashboard
- List of managed services with status indicators
- Quick actions (start, stop, restart)
- Keyboard navigation between services

#### 4. Layout System
- Full-screen mode with alternate buffer
- Split pane support
- Bottom status/command bar
- Responsive to terminal resize

#### 5. Input System
- Global hotkeys
- vim-style navigation
- Command palette (`:` to enter commands)
- Search within logs (`/` to search)

### Phase 2: Enhanced UX

#### 6. Themes & Styling
- Built-in themes (dark, light, minimal)
- Custom color schemes
- Branding support (logo, colors)

#### 7. Notifications
- Toast notifications for events
- Sound alerts (optional)
- Desktop notifications (optional)

#### 8. Persistence
- Remember window layout
- Process state restoration
- Command history

### Phase 3: Advanced Features

#### 9. Plugin System
- Custom commands
- Custom panels
- Third-party integrations

#### 10. Multi-Project Support
- Manage multiple project directories
- Project switching
- Workspace configurations

#### 11. Remote Capabilities
- SSH tunnel support
- Remote log streaming
- Distributed process management

---

## User Experience Goals

### 1. Instant Familiarity
Users should feel at home immediately. Borrow from:
- **vim/neovim**: j/k navigation, modal editing, `/` search
- **tmux**: Pane splitting, prefix keys
- **htop**: Process list navigation
- **Claude Code**: Overall aesthetic and flow

### 2. Zero Config Start
```typescript
import { createCLI } from 'easy-cli';

createCLI({
  services: [
    { name: 'api', command: 'npm run dev', cwd: './api' },
    { name: 'web', command: 'npm run dev', cwd: './web' },
  ]
}).start();
```

### 3. Progressive Disclosure
- Simple things should be simple
- Complex things should be possible
- Advanced features don't clutter the basic experience

### 4. Keyboard-First
- Every action accessible via keyboard
- Shortcuts displayed in UI
- Discoverable through help (`?`)

---

## Success Metrics

1. **Adoption**: npm downloads, GitHub stars
2. **Developer Experience**: Time to first working CLI
3. **Reliability**: Crash reports, issue volume
4. **Community**: Contributions, plugins, showcases

---

## Competitive Landscape

| Tool | Focus | Limitation |
|------|-------|------------|
| concurrently | Run multiple commands | No TUI, just merged output |
| pm2 | Process management | Heavy, server-focused |
| tmux | Terminal multiplexer | Not programmable, steep learning |
| custom scripts | Varies | Reinventing the wheel |

**easy-cli** sits at the intersection: **programmable TUI + process management + beautiful UX**.

---

## Roadmap

### v0.1.0 - Foundation
- [ ] Project setup (TypeScript, build, tests)
- [ ] Core Ink integration with fullscreen-ink
- [ ] Basic process spawning and management
- [ ] Simple log viewer component
- [ ] Keyboard input handling

### v0.2.0 - Usable MVP
- [ ] Service dashboard with status
- [ ] Multi-service log switching
- [ ] vim-style navigation
- [ ] Bottom command bar
- [ ] Graceful shutdown

### v0.3.0 - Polish
- [ ] Split pane layouts
- [ ] Log search and filtering
- [ ] Theming support
- [ ] Configuration file support

### v0.4.0 - Production Ready
- [ ] Error recovery and resilience
- [ ] Performance optimization
- [ ] Comprehensive documentation
- [ ] Example projects

### v1.0.0 - Stable Release
- [ ] API stability guarantee
- [ ] Plugin system
- [ ] Community templates

---

## Design Principles

1. **Composition over Configuration**
   - Small, focused components
   - Combine them as needed
   - Escape hatches for custom behavior

2. **Sensible Defaults, Full Control**
   - Works out of the box
   - Every default can be overridden
   - No magic, transparent behavior

3. **Fail Gracefully**
   - Processes crash? Show the error, offer restart
   - Terminal too small? Adapt or show message
   - Never leave the user stranded

4. **Developer Joy**
   - Beautiful output
   - Helpful error messages
   - Delightful interactions

---

## Name Options (for consideration)

- **easy-cli** - Simple, descriptive
- **tui-kit** - Technical, kit-focused
- **terminux** - Terminal + Linux vibes
- **dashterm** - Dashboard + terminal
- **runscape** - Running + landscape
- **devdash** - Developer dashboard

Current working name: **easy-cli**
