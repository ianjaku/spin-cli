# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains all TypeScript source. Entry points are `src/cli.tsx` (CLI/TUI) and `src/index.ts` (library export).
- UI lives in `src/ui/` (Ink/React components). Process control is in `src/runnables/`. Script tooling is in `src/scripts/`.
- Configuration and integrations live in `src/config/`, `src/mcp/`, and `src/spin-folder/`. Shared types are in `src/types.ts`.
- Build output is emitted to `dist/`. Tests live alongside code as `src/**/*.test.ts` and `src/**/*.test.tsx`.
- Repo-level config templates: `spin.config.example.ts` (shareable) and `spin.config.ts` (local).

## Build, Test, and Development Commands
- `pnpm dev` — run `tsup` in watch mode for fast rebuilds during development.
- `pnpm build` — compile to `dist/` for publishing or local CLI testing.
- `pnpm typecheck` — run `tsc --noEmit` with strict options.
- `pnpm lint` — lint `src/` with ESLint (uses configured/default rules).
- `pnpm test` — run the Vitest suite.
- Example local run: `pnpm build` then `node dist/cli.js --help`.

## Coding Style & Naming Conventions
- Language: TypeScript (ESM). UI is React with Ink.
- Indentation: 2 spaces; use semicolons.
- Naming: React components are `PascalCase.tsx`; utilities/modules are `camelCase.ts`.
- Tests mirror source names: `Thing.test.ts` or `Thing.test.tsx`.

## Testing Guidelines
- Framework: Vitest with `@testing-library/react`/`ink-testing-library` for UI.
- Test file pattern: `src/**/*.test.{ts,tsx}`.
- Coverage: v8 provider; run `pnpm test -- --coverage` for reports.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (e.g., `feat: ...`, `fix: ...`).
- PRs should include a concise summary, testing notes (commands run), and linked issues when applicable.
- For UI changes, include a brief description of the visual/behavioral impact (screenshots or a short recording if available).

## Configuration & Security Tips
- Keep local configuration in `spin.config.ts`; prefer `spin.config.example.ts` for shared defaults.
- Avoid committing secrets or machine-specific paths.
