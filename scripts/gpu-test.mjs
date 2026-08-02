// GPU integration tests: compiles the fixture shaders, bundles a browser entry,
// serves it, and drives the system Chrome to assert on pixels the GPU actually
// produced.
//
// Why this exists separately from `npm test`: the vitest suite runs in node and
// verifies the compiler emits correct GLSL/WGSL *text*. It cannot catch anything
// downstream of that — an invalid bind group layout, a pipeline that fails to
// create, a uniform buffer never uploaded. Four such bugs shipped past a green
// suite while the compute stage was being written, and one of them (uniforms not
// flushed before dispatch) raised no error at all; the shader simply read zeros.
//
// Uses playwright-core with `channel: 'chrome'` rather than playwright, so no
// browser is downloaded — it drives the Chrome already on the machine.

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const step = (label) => console.log(`• ${label}`);

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`✗ ${cmd} ${args.join(' ')} failed`);
    process.exit(1);
  }
}

step('compiling fixture shaders');
run('node', ['packages/brometal/dist/cli/index.js', 'dev', '--once', 'scripts/gpu/fixtures']);

step('bundling the browser entry');
const outDir = mkdtempSync(join(tmpdir(), 'brometal-gpu-'));
run('npx', [
  'esbuild',
  'scripts/gpu/entry.ts',
  '--bundle',
  '--format=esm',
  `--outfile=${join(outDir, 'entry.js')}`,
  // The entry imports 'brometal'; resolve it to the freshly built dist rather
  // than whatever npm may have hoisted.
  `--alias:brometal=${join(root, 'packages/brometal/dist/index.js')}`,
  '--log-level=warning',
]);
writeFileSync(
  join(outDir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>gpu</title>
<style>html,body{margin:0;background:#000}canvas{display:block}</style>
<canvas id="stage" style="width:256px;height:64px"></canvas>
<script type="module" src="./entry.js"></script>`,
);

step('serving the fixture');
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  if (file === '/favicon.ico') {
    res.writeHead(204).end();
    return;
  }
  try {
    const body = readFileSync(join(outDir, file));
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const url = `http://localhost:${server.address().port}/`;

step('launching Chrome with WebGPU');
let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('✗ playwright-core is not installed — run `npm i -D playwright-core`');
  process.exit(1);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
  ],
});

const page = await browser.newPage({ viewport: { width: 320, height: 120 } });
const noise = [];
page.on('console', (m) => noise.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => noise.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
const results = await page
  .waitForFunction(() => window.__GPU_RESULTS__ !== undefined, null, { timeout: 30000 })
  .then(() => page.evaluate(() => window.__GPU_RESULTS__))
  .catch(() => null);

await browser.close();
server.close();

if (results === null) {
  console.error('\n✗ the page never reported results');
  noise.forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}

console.log(`\nbackend: ${results.backend}\n`);
let failed = 0;
for (const check of results.checks) {
  console.log(`  ${check.passed ? '✓' : '✗'} ${check.name}`);
  if (!check.passed) {
    console.log(`      ${check.detail}`);
    failed++;
  }
}

// WebGPU validation failures surface as console warnings rather than exceptions,
// so they are worth showing whenever anything fails.
if (failed > 0 && noise.length > 0) {
  console.log('\n  browser output:');
  noise.forEach((line) => console.log(`    ${line}`));
}

console.log(
  failed === 0
    ? `\n✓ ${results.checks.length} GPU checks passed`
    : `\n✗ ${failed} of ${results.checks.length} GPU checks failed`,
);
process.exit(failed === 0 ? 0 : 1);
