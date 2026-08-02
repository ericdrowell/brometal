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

step('launching browsers');
let chromium;
let webkit;
try {
  ({ chromium, webkit } = await import('playwright-core'));
} catch {
  console.error('✗ playwright-core is not installed — run `npm i -D playwright-core`');
  process.exit(1);
}

// Two targets, asserting different things.
//
// Chrome runs the real GPU checks. Playwright's WebKit exposes no navigator.gpu
// at all, so it cannot run them — but that makes it an exact stand-in for a
// Safari without WebGPU, which is the case that was reaching users as a silent
// black screen. It verifies the refusal and the on-canvas message instead.
//
// Caveat worth knowing: this does NOT cover Safari's WGSL validation, which is
// stricter than Chrome's. Playwright cannot drive real Safari, and its WebKit
// build has no WebGPU, so a Safari-only shader rejection stays invisible here.
const TARGETS = [
  {
    name: 'Chrome',
    expects: 'webgpu',
    launch: () =>
      chromium.launch({
        channel: 'chrome',
        headless: true,
        args: [
          '--enable-unsafe-webgpu',
          '--enable-features=Vulkan,WebGPU',
          '--use-angle=metal',
          '--ignore-gpu-blocklist',
          '--enable-gpu',
        ],
      }),
  },
  {
    name: 'WebKit',
    expects: 'fallback',
    launch: () => webkit.launch({ headless: true }),
  },
];

let failed = 0;
let ran = 0;

for (const target of TARGETS) {
  let browser;
  try {
    browser = await target.launch();
  } catch (error) {
    console.error(`\n✗ ${target.name} failed to launch: ${String(error).split('\n')[0]}`);
    if (target.name === 'WebKit') {
      console.error('  install it with `npx playwright-core install webkit`');
    }
    failed++;
    continue;
  }

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

  console.log(`\n${target.name} — backend: ${results?.backend ?? 'unknown'}\n`);
  if (results === null) {
    console.error('  ✗ the page never reported results');
    noise.forEach((line) => console.error(`    ${line}`));
    failed++;
    continue;
  }

  // A target that reports the wrong mode is a finding in itself: Chrome falling
  // back means WebGPU broke, and WebKit reporting webgpu means this caveat is
  // out of date and the suite should be extended.
  if (results.mode !== target.expects) {
    console.error(`  ✗ expected ${target.expects} mode, got ${results.mode}`);
    failed++;
  }

  for (const check of results.checks) {
    console.log(`  ${check.passed ? '✓' : '✗'} ${check.name}`);
    ran++;
    if (!check.passed) {
      console.log(`      ${check.detail}`);
      failed++;
    }
  }

  // WebGPU validation failures surface as console warnings rather than
  // exceptions, so they are worth showing whenever anything fails.
  if (failed > 0 && noise.length > 0) {
    console.log('\n  browser output:');
    noise.forEach((line) => console.log(`    ${line}`));
  }
}

server.close();

console.log(
  failed === 0
    ? `\n✓ ${ran} checks passed across ${TARGETS.length} browsers`
    : `\n✗ ${failed} failure(s) across ${TARGETS.length} browsers`,
);
process.exit(failed === 0 ? 0 : 1);
