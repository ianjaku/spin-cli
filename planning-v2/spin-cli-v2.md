# Spin CLI v2 - Ergonomic, Production-Ready Dev Orchestration

## North Star
Spin CLI v2 is the most ergonomic way to run, observe, and control multi-service dev environments. It is fast under heavy log volume, delightful for daily use, and robust for teams and open-source maintainers. It works offline, scales with repo size, and feels instant.

## Design Principles
- Zero friction: runs in < 1s, no setup rituals, excellent defaults.
- Ergonomics first: common tasks are 1-2 keystrokes; no cognitive overhead.
- Local-first with team sync: perfect solo use, optional shared config.
- Observable by default: logs, health, status, metrics, and history.
- Scales with complexity: works for 2 services or 200.
- Composable: works with npm, pnpm, bun, docker, and custom runners.

## Core User Flows
### Daily Loop (Fast)
- `spin` -> start last used group, auto-selects active services.
- `:api` -> focus service; `f` to follow; `j/k` scroll; `space` pause.
- `s` stop, `r` restart, `R` restart group; `t` tail last 200 lines.

### Discovery
- `spin list` -> grouped services with status and tags.
- `spin describe api` -> shows env, ports, deps, readiness.
- `spin health` -> aggregated readiness and dependency graph status.

### Debug and Repair
- `spin log api --errors` -> errors only.
- `spin trace api --since 10m` -> structured traces if available.
- `spin doctor` -> common fixes, port conflicts, missing env.

### Team and OSS
- `spin init` -> guided config with templates for common stacks.
- `spin share` -> generate a minimal example config + docs.
- `spin report` -> shareable diagnostics for issues.

## UI and Ergonomics
### TUI Layout
- Top: status bar with grouped services and health indicators.
- Center: log viewer with multi-stream blending, search, and filters.
- Bottom: command bar with one-line hinting and confirmations.

### Accessibility
- Keyboard-only, consistent shortcuts.
- Color-safe palette with optional high contrast.
- Reduced motion option.

### Performance
- Batched log rendering at 30-60hz.
- Ring buffers for logs and events.
- Virtualized log view (only render visible lines).
- Decoupled UI updates: status updates are low-frequency.

## Configuration
### Base config
- `spin.config.ts` for local overrides.
- `spin.config.example.ts` for repo defaults.
- Simple schema, strong typing, computed config functions.

### Env and Secrets
- `.env` support with explicit allowlist.
- Optional integration with 1Password, Doppler, Vault.

### Groups and Tags
- Services can be tagged and grouped (e.g., `api`, `frontend`, `infra`).
- Start by group, or by tag: `spin start --tag db`.

### Defaults
- Auto-restart by default with exponential backoff.
- Default readiness from port checks or log regex.

## Observability
### Logs
- Structured logs when available (JSON parsing, field filters).
- Search and filter with one keystroke.
- Export logs to file or clipboard.

### Metrics
- Optional CPU/memory per service.
- Uptime and restart counts.

### Health
- Readiness checks and dependency graph with topological status.
- Failure mode hints (missing env, ports, build errors).

## Runner Model
### Built-ins
- Shell runner (default)
- Docker runner (container aware)
- Kubernetes runner (optional)

### Custom Runners
- Plugin API: specify a run function, health check, and log parser.
- Support for language-specific runners (rails, django, go, rust, node).

## Script Palette
- Global command palette with fuzzy search.
- Sources: package.json scripts, scripts folder, custom commands.
- Per-script overrides: confirm, cwd, env, description.

## Reliability
- Crash-safe: services are detached and cleanup is robust.
- State persistence: last active group, last active service, scroll position.
- Graceful shutdown: SIGTERM, then SIGKILL after timeout.

## File Layout v2
- `src/ui/` TUI components and layout.
- `src/core/` core orchestration, scheduling, state.
- `src/runners/` runner adapters and readiness checks.
- `src/logs/` log store, filters, parsers.
- `src/config/` config loader and validation.
- `src/cli/` commands and CLI entrypoint.
- `src/plugins/` plugin SDK and integrations.

## Public Commands v2
- `spin` start last group
- `spin start [group|services]`
- `spin stop [group|services]`
- `spin restart [group|services]`
- `spin list`
- `spin logs [service] [--errors] [--json]`
- `spin health`
- `spin doctor`
- `spin init`
- `spin share`
- `spin report`

## Plugin and Extension System
- Plugin manifest: name, version, commands, hooks, UI panels.
- Hooks: onStart, onStop, onLog, onHealth, onConfigLoad.
- UI panels: add extra panes or overlays.
- Capability gating: opt-in to system-level actions.

## Security
- No shell injection: commands are tokenized and sanitized.
- No secret logs by default: redact common patterns.
- Safe defaults for env loading and output sharing.

## Startup and Scale-up Fit
- Templates for popular stacks and monorepos.
- Team-level policies: allowed commands, standard groups.
- Onboarding: auto-detect services and propose config.

## Open Source Maintainers
- Minimal setup for contributors.
- `spin share` generates a clean dev story in `docs/dev.md`.
- `spin report` helps with issue reproduction.

## Product Roadmap
### v2.0
- New log store (ring buffer + batching).
- Structured log filters.
- Script palette v2.
- Config schema v2.

### v2.1
- Plugin SDK, plugin registry.
- Per-service metrics.
- Health graph view.

### v2.2
- Workspace-level config for monorepos.
- Local team profiles.

## Quality Bar
- 95th percentile render latency < 16ms under heavy logs.
- 0 data loss for last N lines per service.
- Time-to-first-log under 1s.
- 90% of core flows reachable in <= 2 keystrokes.

## Migration from v1
- v1 config loader still supported.
- Auto-migration to v2 config format.
- Compatibility layer for old scripts.

## Why This Wins
- Dramatically faster under log load.
- Clear, consistent keyboard-first UX.
- Strong defaults that scale from hobby to enterprise.
- Extensible without sacrificing simplicity.
