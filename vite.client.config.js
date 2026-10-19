import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [
    sites({ mockAuth: false }),
    {
      name: 'encyclopedia-snapshot',
      async generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'data/enrichment/galaxy.json', source: await readFile(new URL('./data/enrichment/galaxy.json', import.meta.url)) });
        this.emitFile({
          type: 'asset',
          fileName: 'data/bundle.json',
          source: await readFile(new URL('./data/bundle.json', import.meta.url)),
        });
      },
    },
  ],
});
