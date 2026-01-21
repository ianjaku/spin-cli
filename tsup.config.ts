import { defineConfig } from 'tsup';

export default defineConfig([
  // CLI entry - with shebang
  {
    entry: { cli: 'src/cli.tsx' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // Library entry - no shebang
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    target: 'node18',
  },
]);
