# Go-to-Market & Differentiation

This document captures a practical GTM plan and clear differentiation for **easy-cli** as a developer experience control plane for local multi-service workflows (processes + logs + scripts + command palette).

---

## Positioning (what we are / are not)

**We are:** a fast, keyboard-first terminal UI for **running, inspecting, and controlling** local dev workflows.  
**We are not:** a build system, CI tool, or full orchestrator.

**Core promise:** “All your dev services, scripts, and logs in one fast, predictable terminal UI — no YAML and no memory tax.”

---

## Target personas & triggers

### 1) Platform / Dev-Tools maintainers
- **Pain:** internal CLIs become unwieldy; onboarding is slow; scripts are tribal knowledge.
- **Trigger:** teams already maintaining a CLI or scripts for dev workflows.
- **Win:** replace bespoke scripts + docs with a discoverable UX.

### 2) Monorepo dev teams
- **Pain:** multi-service local dev is noisy; logs are scattered; script usage is fragile.
- **Trigger:** existing Nx/Turborepo/Moon users who still struggle with local run UX.
- **Win:** own the **interactive dev workflow**, not the task graph.

### 3) Infra/Data adjacent teams
- **Pain:** scripts require SSH/K8s/Docker context; mistakes are costly.
- **Trigger:** “wrong environment” incidents.
- **Win:** per-script execution context + previews reduce mis-execution.

---

## Differentiation vs. incumbents

### vs tmux
- tmux is powerful but not domain-aware.
- easy-cli is **workflow-aware** (scripts, services, contexts).

### vs concurrently / npm scripts
- They run commands; they don’t make them **discoverable and safe**.
- easy-cli turns scripts into a searchable, contextual UI.

### vs Nx / Turborepo / Moon
- They optimize builds; they don’t manage interactive runtime workflows.
- easy-cli focuses on **local runtime UX** and log navigation.

### vs pm2 / docker-compose
- Those are ops-heavy and server-focused.
- easy-cli is **developer experience first**.

---

## GTM plan by phase

### Phase 0 — Design partners (private alpha)
Goal: validate the pain and tighten the MVP.

- Recruit 5–10 teams with multi-service dev workflows.
- 2-week feedback cycles; instrument the top 3 pain points.
- Metrics: time to first useful workflow, daily active use, script palette usage.

### Phase 1 — Sharp MVP launch
Goal: ship a narrow, delightful first experience.

**MVP slice**
- Service list + log viewer
- Command palette + script discovery (package.json + scripts folder)
- Predictable command previews (always show actual resolved command)

**Non-negotiables**
- Fast startup (<1s on typical repos)
- No surprising behavior
- Clean shutdown (no zombie processes)

### Phase 2 — Community pull
Goal: organic adoption.

- “Replace your tmux dev setup in 10 minutes” guides
- “Stop memorizing scripts” demos
- Monorepo starter examples

### Phase 3 — Team adoption
Goal: internal platform teams drive rollouts.

- Team-level config patterns
- Script metadata conventions (owner, repo, context)
- Templates for common stacks

---

## Distribution channels

- GitHub + npm (must be paired with excellent docs and a golden-path demo)
- Monorepo communities (Nx/Turborepo/Moon users)
- Dev-tools influencers (short “before/after” demos)

---

## Messaging pillars

1. **Command palette for scripts**  
   “Never memorize a script name or context again.”

2. **Context-aware execution**  
   “Runs in the right place with the right runner.”

3. **Live multi-stream logs**  
   “Not just output—structured, navigable logs.”

4. **Keyboard-first, zero friction**  
   “No context switches, no mouse, no mental load.”

---

## Risks to mitigate early

- **Trust risk:** forgiving config feels too magical.
  - Always show the resolved command and cwd before execution.
- **Performance risk:** TUI latency kills adoption.
  - Hard performance budgets and safe fallbacks.
- **Expectation risk:** users assume it replaces Nx/tmux/CI.
  - Keep positioning tight: “interactive dev runtime UX.”

---

## Next steps (product)

- Pick one vertical (monorepo dev teams) and build a golden-path demo.
- Validate with 3–5 design partners before expanding scope.
