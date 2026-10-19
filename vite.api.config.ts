import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'apps/api/server.ts', target: 'node24', outDir: 'dist/api', emptyOutDir: true,
    minify: false, sourcemap: false,
    rolldownOptions: { output: { entryFileNames: 'server.mjs', codeSplitting: false } },
  },
  ssr: { target: 'node' },
});
