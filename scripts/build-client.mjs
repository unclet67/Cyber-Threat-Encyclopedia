import { spawnSync } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';

for (const [command, args] of [
  ['python3', ['scripts/build_pages.py']],
  [process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.client.config.js', '--outDir', '.sites-client']],
]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await mkdir('public', { recursive: true });
await cp('.sites-client/assets', 'public/assets', { recursive: true });
await cp('.sites-client/data', 'public/data', { recursive: true });
for (const f of ['sw.js', 'manifest.webmanifest', 'icons']) await cp(`.sites-client/${f}`, `public/${f}`, { recursive: true });
