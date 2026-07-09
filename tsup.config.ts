import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // splitting lets the Ink renderer become its own chunk, dynamically imported
  // only on the `watch` path so the default report / --json cold-start stays lean.
  splitting: true,
  clean: true,
  dts: { entry: 'src/index.ts' },
  banner: { js: '#!/usr/bin/env node' },
});
