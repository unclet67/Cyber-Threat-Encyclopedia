import vinext from 'vinext';
import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';
import { readFile } from 'node:fs/promises';

export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= 'false';
  process.env.WRANGLER_SEND_METRICS ??= 'false';
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    appType: 'custom',
    plugins: [vinext(), sites(), {
      name: 'encyclopedia-preview-shell',
      configureServer(server) {
        // Serve the already bundled shell; Vite's root HTML proxy otherwise
        // tries to recompile the standalone GitHub Pages entry during dev.
        server.middlewares.use(async (request, response, next) => {
          if (request.method !== 'GET' || request.url?.split('?')[0] !== '/') return next();
          try {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(await readFile(new URL('./.sites-client/index.html', import.meta.url), 'utf8'));
          } catch { next(); }
        });
      },
    }, cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      inspectorPort: false,
      config: {
        main: './build/sites-worker.ts',
        compatibility_flags: ['nodejs_compat'],
        d1_databases: [{ binding: 'DB', database_name: 'encyclopedia', database_id: '00000000-0000-4000-8000-000000000000' }],
      },
    })],
  };
});
