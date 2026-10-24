// Renders icons/*.png for the home-screen app. Usage: node scripts/make-icons.cjs icons
const { chromium } = require('playwright');
const out = process.argv[2];
// Full-bleed square; the mark sits inside the central 60% so maskable crops keep it.
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 100 100">
<rect width="100" height="100" fill="#17201e"/>
<rect y="0" width="100" height="9" fill="#007a33"/>
<path d="M50 22 L72 30 V50 C72 64 62 74 50 79 C38 74 28 64 28 50 V30 Z" fill="none" stroke="#7db4dc" stroke-width="4" stroke-linejoin="round"/>
<text x="50" y="56.5" text-anchor="middle" font-family="DejaVu Sans Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="17" fill="#e3eae7" letter-spacing="0.5">CTE</text>
</svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [name, s] of [['icon-180.png',180],['icon-192.png',192],['icon-512.png',512]]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0">${svg(s)}</body></html>`);
    await p.screenshot({ path: `${out}/${name}`, omitBackground: false });
  }
  await b.close();
})();
