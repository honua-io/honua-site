// Generates GitHub social-preview cards (1280x640) for honua-io public repos,
// plus org avatar renders of the site logo. Screenshot via cached Playwright chromium.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHROME = process.env.CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const SITE = new URL('../assets', import.meta.url).pathname;
const OUT = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const TMP = process.env.TMPDIR ?? '/tmp';
mkdirSync(OUT + '/social-previews', { recursive: true });

const MARK = readFileSync(SITE + '/honua-logo.svg', 'utf8')
  .replace(/<title[^>]*>.*?<\/title>/s, '')
  .replace('<svg ', '<svg width="100%" height="100%" ');

// palette from honua-site styles.css
const C = {
  bg: '#08131a', bg2: '#0d2033', surface: '#0e1e27', rule: '#22343f',
  text: '#e6efee', dim: '#8ea7a6', teal: '#5fc4a6', tealDeep: '#3aa088',
  blue: '#85c9f4', blueDeep: '#3a7aa0', amber: '#f2aa78', cream: '#e9efed',
};

// Covers the public repos we brand. Deliberately excluded: .allstar (org policy
// config), honua-site-preview (empty deploy mirror), and archived repos such as
// honua-server-admin. Add an entry here if one of those changes status.
const REPOS = [
  { name: 'honua-server',      cat: 'PLATFORM',      accent: C.teal,  desc: 'Cloud-native multi-protocol geospatial server' },
  { name: 'honua-console',     cat: 'PLATFORM',      accent: C.teal,  desc: 'Studio · Catalog · Operate · Share — the Honua web console' },
  { name: 'honua-helm',        cat: 'PLATFORM',      accent: C.teal,  desc: 'Helm chart for deploying Honua on Kubernetes' },
  { name: 'honua-sdk-js',      cat: 'SDK',           accent: C.blue,  desc: 'JavaScript & TypeScript SDKs and MCP server' },
  { name: 'honua-sdk-python',  cat: 'SDK',           accent: C.blue,  desc: 'Python SDK for the Honua platform' },
  { name: 'honua-sdk-dotnet',  cat: 'SDK',           accent: C.blue,  desc: '.NET SDKs for the Honua platform' },
  { name: 'honua-mobile',      cat: 'SDK',           accent: C.blue,  desc: '.NET MAUI mobile SDK & offline GeoPackage foundation' },
  { name: 'honua-collect',     cat: 'FIELD APP',     accent: '#8CC56A', desc: 'Offline-first mobile field data collection' },
  { name: 'honua-qgis-plugin', cat: 'TOOL',          accent: C.amber, desc: 'Local-first AI assistant plugin for QGIS' },
  { name: 'honua-esri-assess', cat: 'TOOL',          accent: C.amber, desc: 'Esri footprint assessment CLI for migration discovery' },
  { name: 'geospatial-grpc',   cat: 'OPEN STANDARD', accent: C.cream, desc: 'Open gRPC protocol standard for geospatial data' },
  { name: 'geospatial-mcp',    cat: 'OPEN STANDARD', accent: C.cream, desc: 'Open geospatial MCP standard for AI workflows' },
  { name: 'geobench',          cat: 'BENCHMARKS',    accent: C.amber, desc: 'Vendor-neutral benchmarks for geospatial servers' },
  { name: 'honua-gis-llm',     cat: 'MODELS',        accent: C.blue,  desc: 'Open-weights GIS model evaluation & training' },
  { name: 'honua-site',        cat: 'WEB',           accent: C.teal,  desc: 'Source for honua.io' },
  { name: '.github',           cat: 'ORGANIZATION',  accent: C.teal,  desc: 'One server. Open standards. Your cloud.', title: 'Honua', crumb: 'github.com/honua-io' },
];

// contour-line art, echoes the site og-image (teal/blue lines, amber dashed orbit, node dots)
const ART = `
<svg viewBox="0 0 620 640" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <g stroke="${C.blueDeep}" stroke-opacity=".28" stroke-width="1">
    ${Array.from({ length: 7 }, (_, i) => `<path d="M-20 ${60 + i * 88} C 150 ${20 + i * 88}, 300 ${110 + i * 82}, 460 ${55 + i * 86} S 640 ${95 + i * 84}, 700 ${60 + i * 88}"/>`).join('\n')}
  </g>
  <g stroke="${C.tealDeep}" stroke-opacity=".5" stroke-width="1.4">
    <path d="M40 520 C 160 470, 210 330, 330 300 S 560 330, 660 240"/>
    <path d="M-10 430 C 130 400, 240 260, 380 235 S 590 260, 690 170"/>
    <path d="M90 610 C 200 560, 260 420, 390 385 S 610 400, 700 320"/>
  </g>
  <path d="M120 640 C 240 480, 420 420, 660 400" stroke="${C.amber}" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="7 8"/>
  <path d="M240 0 C 300 140, 420 210, 640 230" stroke="${C.amber}" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="2 7"/>
  <g stroke="${C.rule}" stroke-opacity=".55" stroke-width="1">
    ${Array.from({ length: 6 }, (_, i) => `<line x1="${80 + i * 100}" y1="0" x2="${80 + i * 100}" y2="640"/>`).join('\n')}
  </g>
  <g fill="${C.teal}">
    <circle cx="330" cy="300" r="4"/><circle cx="380" cy="235" r="3"/><circle cx="390" cy="385" r="3.5"/>
    <circle cx="330" cy="300" r="10" fill-opacity=".25"/><circle cx="390" cy="385" r="9" fill-opacity=".2"/>
  </g>
  <g fill="${C.blue}"><circle cx="500" cy="150" r="3"/><circle cx="560" cy="330" r="2.5"/><circle cx="470" cy="480" r="3"/><circle cx="500" cy="150" r="8" fill-opacity=".22"/></g>
  <g fill="${C.amber}"><circle cx="430" cy="560" r="2.5"/><circle cx="300" cy="90" r="2.5"/></g>
</svg>`;

const page = (r) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Geist; src: url("file://${SITE}/fonts/geist-latin.woff2") format("woff2"); }
@font-face { font-family: GeistMono; src: url("file://${SITE}/fonts/geist-mono-latin.woff2") format("woff2"); }
* { margin: 0; box-sizing: border-box; }
body { width: 1280px; height: 640px; overflow: hidden; position: relative;
  background: radial-gradient(120% 140% at 85% 10%, ${C.bg2} 0%, ${C.bg} 62%);
  font-family: Geist, sans-serif; color: ${C.text}; }
.art { position: absolute; right: 0; top: 0; width: 620px; height: 640px;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 200px); }
.inner { position: absolute; inset: 0; padding: 72px 80px; display: flex; flex-direction: column; }
.top { display: flex; align-items: center; gap: 26px; }
.chip { width: 96px; height: 96px; border-radius: 24px; background: #EAF7F4; padding: 12px;
  border: 1px solid ${C.tealDeep}; box-shadow: 0 0 0 6px rgba(95,196,166,.08); }
.crumb { font-family: GeistMono, monospace; font-size: 24px; color: ${C.dim}; letter-spacing: .02em; }
.crumb b { color: ${C.text}; font-weight: 500; }
.mid { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-bottom: 24px; }
h1 { font-size: ${r.title && r.title.length <= 8 ? 150 : (r.name.length > 15 ? 74 : 88)}px;
  font-weight: 650; letter-spacing: -0.03em; line-height: 1.02; max-width: 780px; }
.desc { margin-top: 26px; font-size: 33px; line-height: 1.35; color: ${C.dim}; max-width: 680px; }
.bottom { display: flex; align-items: center; gap: 24px; }
.cat { font-family: GeistMono, monospace; font-size: 21px; letter-spacing: .14em; color: ${r.accent};
  border: 1.5px solid; border-radius: 999px; padding: 9px 22px; opacity: .92; }
.url { font-family: GeistMono, monospace; font-size: 22px; color: ${C.dim}; opacity: .85; }
.rule { flex: 1; height: 1px; background: linear-gradient(90deg, ${C.rule}, transparent); }
</style></head><body>
<div class="art">${ART}</div>
<div class="inner">
  <div class="top"><div class="chip">${MARK}</div>
    <div class="crumb">${r.crumb ?? `honua-io / <b>${r.name}</b>`}</div></div>
  <div class="mid"><h1>${r.title ?? r.name}</h1><div class="desc">${r.desc}</div></div>
  <div class="bottom"><span class="cat">${r.cat}</span><span class="rule"></span><span class="url">honua.io</span></div>
</div></body></html>`;

const avatar = (bg) => `<!DOCTYPE html><html><head><style>*{margin:0}
body { width: 1024px; height: 1024px; ${bg ? `background: radial-gradient(120% 120% at 30% 20%, ${C.bg2}, ${C.bg}); ` : ''}display: grid; place-items: center; }
.m { width: ${bg ? 760 : 940}px; height: ${bg ? 760 : 940}px; }</style></head>
<body><div class="m">${MARK}</div></body></html>`;

function shoot(html, file, w, h) {
  const src = TMP + '/current.html';
  writeFileSync(src, html);
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--allow-file-access-from-files', '--default-background-color=00000000',
    `--screenshot=${file}`, `--window-size=${w},${h}`, `file://${src}`], { stdio: 'pipe' });
  console.log('wrote', file);
}

for (const r of REPOS) shoot(page(r), `${OUT}/social-previews/${r.name.replace('.', 'dot-')}.png`, 1280, 640);
shoot(avatar(false), `${OUT}/org-avatar-transparent.png`, 1024, 1024);
shoot(avatar(true), `${OUT}/org-avatar-navy.png`, 1024, 1024);
