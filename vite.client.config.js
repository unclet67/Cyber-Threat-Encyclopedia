import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';

const PWA_FILES = ['sw.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

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
        for (const f of PWA_FILES) this.emitFile({ type: 'asset', fileName: f, source: await readFile(new URL(`./${f}`, import.meta.url)) });
      },
    },
    {
      // The service worker and manifest need fixed root paths, so undo Vite's hashed rewrite of their links.
      name: 'pwa-fixed-paths',
      enforce: 'post',
      generateBundle(_, bundle) {
        const page = bundle['index.html'];
        page.source = String(page.source)
          .replace(/href="[^"]*manifest-[^"]*\.webmanifest"/, 'href="manifest.webmanifest"')
          .replace(/href="[^"]*icon-180-[^"]*\.png"/, 'href="icons/icon-180.png"');
        for (const k of Object.keys(bundle)) if (/^assets\/(manifest|icon-180)-/.test(k)) delete bundle[k];
      },
    },
  ],
});
