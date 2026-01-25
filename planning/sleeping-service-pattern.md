# Feature Plan: "Sleeping Service" Pattern (Dynamic Start)

## Goal
Allow users to start services that were not initially requested when `spin` was launched, without restarting the entire CLI.

## The Problem
Currently, `spin` only initializes the services that are explicitly requested (or implied by groups) at startup.
If a user runs `spin service-a`, `service-b` is not loaded into the `RunnableManager` at all. To start `service-b`, the user must kill `spin` and run `spin service-a service-b`.

## The Solution: "Sleeping Services"
We will change the initialization logic so that **all** defined services are loaded into the `RunnableManager` at startup, but only the requested ones are *started*. The unrequested services will remain in a `stopped` state (sleeping) until the user explicitly starts them via the UI.

---

## Keybinding Changes

**New keybindings:**
- `s` - **Start Service Picker** (new overlay to start a sleeping service)
- `x` - Stop current service (changed from `s`)

**Unchanged:**
- `a` - Start current service (one already in the bar, but stopped)
- `r` - Restart current service
- `R` - Restart all services
- `b` - Background scripts list
- `:` - Command palette
- `?` - Help
- `q` - Quit

---

## UI Flow: Start Service Picker

### Step 1: Service Selection
User presses `s`. An overlay appears listing all stopped/hidden services:

```
┌─────────────────────────────────────┐
│  Start Service                      │
│                                     │
│  > postgres                         │
│    redis                            │
│    queue                            │
│    web                              │
│                                     │
│  [enter] select   [esc] cancel      │
└─────────────────────────────────────┘
```

### Step 2: Dependency Confirmation (if applicable)
If the selected service has dependencies that are not already running, show them:

```
┌─────────────────────────────────────┐
│  Starting: web                      │
│                                     │
│  Dependencies:                      │
│    postgres ◐ starting...           │
│    redis    ✓ already running       │
│                                     │
│  [esc] cancel                       │
└─────────────────────────────────────┘
```

**Important:** Dependencies that are already running should NOT be restarted. They just show as "✓ already running".

### Step 3: Completion
Once the service (and any needed dependencies) are running, the overlay closes and the service appears in the status bar.

---

## Implementation Details

### 1. `RunnableInstance` Changes (`src/types.ts`)
Add a `hidden` property to `RunnableInstance`.
- `hidden: boolean`: If true, the service is not shown in the status bar.
- Default: `true` for services that were not in the initial start list.
- When a service is started (manually or via dependency), `hidden` becomes `false`.

### 2. `RunnableManager` Changes (`src/runnables/manager.ts`)

- **`init(ids: string[])`**: Called with ALL service IDs.
- **`startAll(ids?: string[])`**:
    - Calculate transitive dependencies for the provided `ids`.
    - Mark these IDs (and their not-already-running dependencies) as `hidden = false`.
    - Start only the ones that aren't already running.
- **`start(id: string)`**:
    - Set `hidden = false`.
    - If dependencies are stopped, start them too (and unhide them).
- **`getTransitiveDependencies(ids: string[])`**: New helper method.

### 3. CLI Entry Point Changes (`src/cli.tsx`)

```typescript
// Initialize with ALL service keys
manager.init(Object.keys(config.runnables));

// ... resolve targets from CLI args ...

// Start only the requested targets (and their deps)
await manager.startAll(targets);
```

### 4. UI Changes

#### `StatusBar.tsx`
- Filter: `instances.filter(i => !i.hidden)`

#### `App.tsx`
- Change `s` keybinding from "stop" to "start service picker"
- Add `x` keybinding for "stop current service"
- Add new mode: `"start-picker"`

#### New Component: `StartServicePicker.tsx`
- Lists all hidden/stopped services
- Arrow key navigation
- Enter to select
- Shows dependency confirmation if needed
- Tracks dependency start status in real-time

---

## Dependency Resolution Logic

```typescript
getTransitiveDependencies(ids: string[]): string[] {
  const visited = new Set<string>();
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const deps = this.instances.get(id)?.definition.dependsOn ?? [];
    queue.push(...deps);
  }
  return Array.from(visited);
}
```

---

## Edge Cases

1. **Service with no dependencies**: Skip confirmation, start immediately.
2. **All dependencies already running**: Skip confirmation, start immediately.
3. **Circular dependencies**: Already handled by existing cycle detection in `getTopologicalOrder`.
4. **User cancels during dependency start**: Stop the dependencies that were just started? Or leave them running? (TBD - probably leave them running since they might be useful)
