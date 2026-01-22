# Feature: Scripts & Command Palette

Run ad-hoc commands and scripts without leaving spin.

---

## The Problem

When spin is running, users often need to:
- Run a quick command (`bun add lodash`)
- Execute a script (`scripts/migrate.ts`)
- Run an npm script (`npm run build`)

Currently, they must quit spin or open another terminal. This breaks flow.

Additionally:
- Users don't remember all script names/locations
- Scripts may need to run in specific contexts (folders, containers)

---

## Design Principles

### 1. Input = Fuzzy Search

The command palette input is always a fuzzy search. As you type, matching scripts filter below. No separate "search mode" vs "command mode" - it's always searching.

### 2. Explicit Configuration

Users configure how scripts run. No magic "try bun, then tsx, then ts-node" detection. The user sets their runner, and that's what's used. Predictable beats magical.

### 3. Folder-Based Configuration

Instead of listing individual scripts, point to folders and define how to run them. Add a file to the folder → it appears in the palette automatically.

### 4. Fast Execution

- **Enter** = run first match immediately
- **Tab** = autofill first match into input (to add arguments)

Minimize keystrokes for the common case.

### 5. Context Awareness

Scripts run in the right place by default:
- If a script is in `packages/api/scripts/`, run it from `packages/api/`
- If viewing a runnable's logs, ad-hoc commands default to that runnable's `cwd`

---

## User Experience

### Opening the Command Palette

Press `:` to open the command palette.

```
┌─ Run ──────────────────────────────────────────────┐
│ > █                                                │
├────────────────────────────────────────────────────┤
│   remix/migrate.ts                  → bun run      │
│   ops/migrate.ts                    → docker (ops) │
│   deploy.sh                         → bash         │
│   dev                               → npm run      │
│   build                             → npm run      │
│   test                              → npm run      │
└────────────────────────────────────────────────────┘
```

Clean view showing your configured scripts. No clutter.

### Display Format

Each script shows:
- **Left side**: Searchable name (folder prefix + filename, or script name)
- **Right side**: How it runs (runner or execution context)

```
│   remix/migrate.ts                  → bun run      │
│   ops/migrate.ts                    → docker (ops) │
│   build                             → npm run      │
```

This format:
- Lets you search by folder: `remix mig` finds `remix/migrate.ts`
- Shows at a glance how each script will be executed
- Handles collisions clearly (two `migrate.ts` files are distinguishable)

### Fuzzy Search

Type to filter scripts.

```
┌─ Run ──────────────────────────────────────────────┐
│ > migrate█                                         │
├────────────────────────────────────────────────────┤
│   remix/migrate.ts                  → bun run      │
│   ops/migrate.ts                    → docker (ops) │
│   db:migrate                        → npm run      │
└────────────────────────────────────────────────────┘
```

The search matches against:
- Script names
- Folder prefixes
- Full file paths

### Command History (↑ to access)

Press `↑` on empty input to cycle through previous commands (like bash/zsh).

```
┌─ Run ──────────────────────────────────────────────┐
│ > bun run remix/migrate.ts --seed█                 │  ← previous command
├────────────────────────────────────────────────────┤
│   remix/migrate.ts                  → bun run      │
└────────────────────────────────────────────────────┘
```

- `↑` cycles to older commands
- `↓` cycles to newer commands
- Edit the command and press `Enter` to run

This keeps the UI clean while still giving you quick access to history.

### Handling Collisions

When multiple scripts match (e.g., two folders have `migrate.ts`), show all matches. User picks with arrow keys, or `Enter`/`Tab` to use the first one.

```
│ > migrate█                                         │
├────────────────────────────────────────────────────┤
│   remix/migrate.ts                  → bun run      │
│ ▸ ops/migrate.ts                    → docker (ops) │  ← selected
│   db:migrate                        → npm run      │
└────────────────────────────────────────────────────┘
```

### Enter to Run

Press `Enter` to immediately run the first (highlighted) match.

### Tab to Autofill

Press `Tab` to fill the first match into the input field:

```
┌─ Run ──────────────────────────────────────────────┐
│ > bun run packages/remix/scripts/migrate.ts█       │
├────────────────────────────────────────────────────┤
│   remix/migrate.ts                  → bun run      │
└────────────────────────────────────────────────────┘
```

Now you can add arguments:

```
│ > bun run packages/remix/scripts/migrate.ts --seed█│
```

Press `Enter` to run.

### Shell Commands (Bypass Search)

For common shell commands like `git`, `bun`, `npm`, etc., you don't want to wait for search results. These run immediately when you press Enter.

**Configured shell commands:**

```
│ > git status█                                      │
```

If `git` is in your `shellCommands` config, pressing Enter runs it immediately - no search, no "no matches" message.

**`!` prefix (escape hatch):**

For any command not in your configured list, prefix with `!` to bypass search:

```
│ > !some-obscure-command --flag█                    │
```

The `!` tells spin "run this as a shell command, don't search."

### Ad-hoc Commands (No Matches)

If your input doesn't match any script and isn't a configured shell command, it still runs as a shell command - but you'll see the "no matches" indicator first:

```
│ > random-command█                                  │
├────────────────────────────────────────────────────┤
│   (no matches - will run as shell command)         │
└────────────────────────────────────────────────────┘
```

Press `Enter` to run it in the current context (selected runnable's cwd, or project root).

---

## Configuration

### Basic Example

```typescript
import { defineConfig, scriptsFolder, packageScripts, docker } from 'spin-cli';

export default defineConfig({
  runnables: { ... },
  
  // Commands starting with these bypass search and run immediately
  shellCommands: ["git", "bun", "npm", "pnpm", "yarn", "docker", "kubectl"],
  
  scripts: [
    // Include npm/bun/pnpm scripts from package.json files
    packageScripts(),
    
    // Script folders with their runners
    scriptsFolder("packages/remix/scripts", "bun"),
    scriptsFolder("packages/api/scripts", "bun"),
    scriptsFolder("scripts", "bash"),
    
    // Scripts that run in Docker
    scriptsFolder("packages/ops/scripts", docker("ops-container")),
  ],
});
```

### `packageScripts()` - Include package.json Scripts

Discovers and includes scripts from `package.json` files.

```typescript
scripts: [
  // Include all package.json scripts from root and subdirectories
  packageScripts(),
  
  // Or customize which package.json files to include
  packageScripts({
    include: [".", "packages/*"],
    exclude: ["packages/deprecated"],
  }),
]
```

Scripts appear in the palette as:
```
│   dev                               → npm run      │
│   build                             → npm run      │
│   test                              → npm run (api)│
```

Automatically detects your package manager (npm/bun/pnpm/yarn) from lockfiles.

### `shellCommands` - Bypass Search for Common Commands

Configure command prefixes that should skip search and run immediately:

```typescript
export default defineConfig({
  // Commands starting with these run immediately (no search)
  shellCommands: ["git", "bun", "npm", "pnpm", "yarn", "docker", "kubectl", "make"],
  
  scripts: [...],
});
```

When you type `git commit -m "test"` and press Enter, it runs immediately without showing search results.

**Default value:** `["git", "bun", "npm", "pnpm", "yarn", "node", "docker", "kubectl", "make"]`

You can extend the defaults:

```typescript
import { defaultShellCommands } from 'spin-cli';

export default defineConfig({
  shellCommands: [...defaultShellCommands, "poetry", "cargo", "go"],
  scripts: [...],
});
```

Or replace entirely:

```typescript
export default defineConfig({
  shellCommands: ["git", "bun"],  // Only these bypass search
  scripts: [...],
});
```

**Escape hatch:** For commands not in your list, prefix with `!` to bypass search:

```
> !some-command --flag
```

### `scriptsFolder()` - Add Script Folders

Point to a folder, define how to run scripts in it.

```typescript
scriptsFolder(path: string, runner: string | RunnerConfig)
```

**Simple runner (string):**

```typescript
scriptsFolder("packages/remix/scripts", "bun")
// migrate.ts → "bun run packages/remix/scripts/migrate.ts"
// seed.ts    → "bun run packages/remix/scripts/seed.ts"
```

**Custom runner function:**

```typescript
scriptsFolder("packages/core/scripts", {
  run: (scriptPath) => `custom-runner ${scriptPath}`,
})
```

**Docker context:**

```typescript
scriptsFolder("packages/ops/scripts", docker("ops-container"))
// migrate.ts → "docker exec -it ops-container bun run migrate.ts"
```

**Kubernetes context:**

```typescript
scriptsFolder("packages/api/scripts", kubernetes({
  selector: "app=api",
  container: "api",
  runner: "bun run",
}))
// migrate.ts → "kubectl exec -it <pod> -c api -- bun run migrate.ts"
```

### Folder Labels

The folder name becomes a prefix in the palette for disambiguation:

```typescript
scriptsFolder("packages/remix/scripts", "bun")
// Shows as: "remix/migrate.ts"

scriptsFolder("packages/ops/scripts", docker("ops"), { label: "ops" })
// Shows as: "ops/migrate.ts"
```

By default, the label is inferred from the folder path (uses the parent folder name). Override with `{ label: "custom" }`.

### Overrides

Handle special cases for specific scripts within a folder:

```typescript
scriptsFolder("scripts", "bun", {
  overrides: {
    "dangerous-reset.ts": {
      confirm: true,  // Ask before running
    },
    "deploy.ts": {
      description: "Deploy to production",
      confirm: true,
    },
  },
})
```

### Full Configuration Example

```typescript
import { 
  defineConfig, 
  scriptsFolder, 
  packageScripts, 
  docker, 
  kubernetes,
  defaultShellCommands,
} from 'spin-cli';

export default defineConfig({
  runnables: {
    api: shell("bun run dev", { cwd: "./packages/api" }),
    web: shell("npm run dev", { cwd: "./packages/web" }),
  },
  
  // Shell commands that bypass search (extend defaults)
  shellCommands: [...defaultShellCommands, "poetry", "cargo"],
  
  scripts: [
    // Package.json scripts (auto-detects package manager)
    packageScripts(),
    
    // Local TypeScript scripts
    scriptsFolder("packages/remix/scripts", "bun"),
    scriptsFolder("packages/api/scripts", "bun", {
      overrides: {
        "reset-db.ts": { confirm: true },
      },
    }),
    
    // Shell scripts
    scriptsFolder("scripts", "bash"),
    
    // Scripts that run in containers
    scriptsFolder("packages/ops/scripts", docker("ops-container"), {
      label: "ops",
    }),
    
    // Scripts that run in Kubernetes
    scriptsFolder("packages/k8s/scripts", kubernetes({
      selector: "app=api",
      container: "api", 
      runner: "bun run",
    }), {
      label: "k8s",
    }),
  ],
});
```

---

## Command Output

When a command runs, show output in a modal overlay:

```
┌─ bun run packages/remix/scripts/migrate.ts ────────┐
│ Running in: packages/remix/                        │
├────────────────────────────────────────────────────┤
│ [12:34:56] Starting migration...                   │
│ [12:34:57] Applied migration 001_users             │
│ [12:34:57] Applied migration 002_posts             │
│ [12:34:58] Done.                                   │
│                                                    │
├────────────────────────────────────────────────────┤
│ ✓ Completed in 2.1s       [Enter] close  [r] rerun │
└────────────────────────────────────────────────────┘
```

- Real-time streaming output
- Success/failure indicator
- `Enter` or `Esc` to close
- `r` to rerun
- `Ctrl+C` to cancel running command

---

## Keyboard Shortcuts

In the command palette:

| Key | Action |
|-----|--------|
| `Enter` | Run first/selected match (or shell command if no match) |
| `Tab` | Autofill first/selected match into input |
| `↑/↓` | Navigate matches, or cycle through history when input is empty |
| `j/k` | Navigate matches (vim-style) |
| `Escape` | Close palette |
| `Ctrl+C` | Close palette |

Special input prefixes:

| Prefix | Effect |
|--------|--------|
| `!` | Bypass search, run as shell command immediately |
| (configured shellCommands) | Bypass search automatically (e.g., `git`, `npm`) |

In the output overlay:

| Key | Action |
|-----|--------|
| `Enter` / `Escape` | Close |
| `r` | Rerun command |
| `y` | Copy output to clipboard |
| `Ctrl+C` | Cancel running command |

---

## Example Flows

### Quick run (3 keystrokes)

1. Press `:` → palette opens
2. Type `mig` → shows matching scripts
3. Press `Enter` → runs first match

### Run with arguments

1. Press `:` → palette opens
2. Type `mig` → shows matching scripts
3. Press `Tab` → autofills the command
4. Add args: `--seed --verbose`
5. Press `Enter` → runs with arguments

### Pick from multiple matches

1. Press `:` → palette opens
2. Type `migrate` → shows multiple matches
3. Press `↓` to select `ops/migrate.ts`
4. Press `Enter` → runs selected script

### Shell command (instant)

1. Press `:` → palette opens
2. Type `git status`
3. Press `Enter` → runs immediately (no search, `git` is in shellCommands)

### Ad-hoc command with `!`

1. Press `:` → palette opens
2. Type `!weird-cli --flag`
3. Press `Enter` → runs immediately (`!` bypasses search)

### Ad-hoc command (no matches)

1. Press `:` → palette opens
2. Type `unknown-command`
3. See "no matches - will run as shell command"
4. Press `Enter` → runs as shell command

---

## Edge Cases

### No Matches

If input doesn't match any script, it runs as a raw shell command in the current context (selected runnable's cwd, or project root).

### Scripts with Same Name

Show all matches with their folder prefix. User picks with arrow keys.

```
│ > migrate█                                         │
├────────────────────────────────────────────────────┤
│   remix/migrate.ts                  → bun run      │
│   ops/migrate.ts                    → docker (ops) │
│   api/migrate.ts                    → k8s (api)    │
└────────────────────────────────────────────────────┘
```

### Arguments with Spaces

Quotes are preserved:

```
│ > bun run scripts/greet.ts "Hello World"█          │
```

### Script File Doesn't Exist

If a script file in a configured folder is deleted:
- It no longer appears in the palette
- Folder is scanned on palette open (with caching)

---

## Future Considerations

### Pinned Scripts

Pin frequently used scripts to the bottom bar:

```typescript
scriptsFolder("scripts", "bun", {
  overrides: {
    "migrate.ts": { pin: "m" },  // Trigger with 'm' key
  },
})
```

Bottom bar shows: `m:migrate  d:deploy  ::more  q:quit`

### Hooks

Run scripts automatically on events:

```typescript
hooks: {
  'runnable:ready:api': 'scripts/notify.ts',
  'runnable:error:*': 'scripts/alert.ts',
}
```

---

## Summary

1. **`:` opens command palette**
2. **Type to fuzzy search** - input is always a search
3. **Enter** runs first match immediately
4. **Tab** autofills first match so you can add arguments
5. **`↑` on empty input** cycles through command history (shell-style)
6. **`shellCommands`** - configured prefixes bypass search (git, npm, etc.)
7. **`!` prefix** - escape hatch to run any command without search
8. **`packageScripts()`** includes npm/bun/pnpm scripts
9. **`scriptsFolder()`** adds script folders with configured runners
10. **Folder prefix** disambiguates scripts with same name
11. **Overrides** handle special cases (confirm, description, pin)
12. **Contexts** for docker/kubernetes/ssh execution
