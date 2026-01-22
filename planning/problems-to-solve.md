# Problems to Solve

Real-world frustrations that spin should address.

---

## 1. Can't run ad-hoc commands while spin is running

**The problem**: Spin takes over the terminal (fullscreen TUI). When I need to run a quick command like `bun add lodash`, I have to either:
- Quit spin, run the command, restart spin
- Open a new terminal

Both are annoying context switches.

**Desired UX**: Run commands without leaving spin.

**Potential solutions**:
- `:command` mode (vim-style `:!`) - run a command, see output, return
- Suspend to shell (`Ctrl+Z`) - drop to shell, `fg` to return
- Shell drawer - embedded mini-terminal pane

**Smart context**: Commands should run in the selected service's `cwd` by default.

---

## 2. Don't remember script names or locations

**The problem**: Projects have many scripts scattered across different folders:
- `./package.json` scripts
- `./apps/web/package.json` scripts
- `./packages/api/package.json` scripts
- Random shell scripts in various locations

I don't remember:
- What scripts exist
- Where they are
- The exact command to run them

**Desired UX**: Discover and run scripts without memorizing paths.

**Potential solutions**:
- Auto-discover scripts from all `package.json` files in the project
- Fuzzy search / autocomplete when entering commands
- Browsable script list grouped by location

---

## 3. Scripts need to run in specific contexts (containers, etc.)

**The problem**: In complex setups (e.g., minikube, docker-compose), scripts need to run:
- In a specific container
- With specific env vars
- In a specific working directory

Remembering which context each script needs is error-prone.

**Desired UX**: Scripts know their own context. I just pick the script, it runs in the right place.

**Potential solutions**:
- Script definitions include their execution context
- Per-folder or per-project "run profiles" that specify how to execute
- Integration with docker/kubectl to run commands inside containers

---

## Design Philosophy: Forgiving Configuration

The user configures, but spin tries multiple interpretations so it "just works."

**Principle**: Whatever feels natural should work without reading docs.

Examples:
- User writes `migrate.ts` → spin tries `bun run migrate.ts`, `tsx migrate.ts`, etc.
- User writes `scripts/deploy` → spin tries with `.sh`, `.ts` extensions, or as executable
- User writes `npm:build` → spin expands to `npm run build`

When there's ambiguity (multiple matches), show all options and let user choose.

---

## Solution

See [feature-scripts.md](./feature-scripts.md) for the full design.

Key elements:
- **Command palette** (`:`) for discovering and running scripts
- **Fuzzy search** across configured and discovered scripts
- **Tab to autofill** then add arguments
- **Execution contexts** for kubernetes/docker/ssh
- **Forgiving config** that interprets user intent flexibly
