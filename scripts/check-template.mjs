// Builds templates/js13k against the *local* package and fails if it breaks or
// goes over budget.
//
// This exists because the starter is the thing new users run first, and it is
// the part most likely to rot silently: it depends on the js13k runtime's API,
// the --js13k serializer, and the shader DSL all at once. Three separate bugs in
// that runtime shipped and were only caught by rendering it — a template with no
// CI would have carried them into someone's jam entry.
//
// It also keeps the README's size claim honest, since the number is measured
// here rather than remembered.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const template = join(root, 'templates', 'js13k');
const cli = join(root, 'packages', 'brometal', 'dist', 'cli', 'index.js');

if (!existsSync(cli)) {
  console.error('✗ packages/brometal/dist is missing — run `npm run build` first');
  process.exit(1);
}

console.log('• building templates/js13k against the local package');
try {
  execFileSync('node', ['build.mjs'], {
    cwd: template,
    stdio: 'inherit',
    env: { ...process.env, BROMETAL_CLI: cli },
  });
} catch {
  console.error('\n✗ the js13k template failed to build');
  process.exit(1);
}

const size = JSON.parse(readFileSync(join(template, '.size.json'), 'utf8'));
const measured = size.zip ?? size.js;

// A ceiling well under the jam limit. The starter should stay a starter — if it
// creeps toward 13 kB there is nothing left for the game it is meant to seed.
const STARTER_CEILING = 6000;
if (measured > STARTER_CEILING) {
  console.error(
    `\n✗ the starter is ${measured} bytes, over its ${STARTER_CEILING} ceiling.\n` +
      `  It is meant to leave most of the 13 kB for the game.`,
  );
  process.exit(1);
}

console.log(`\n✓ template builds and fits (${measured} bytes, ceiling ${STARTER_CEILING})`);

// ── The core's own budget ─────────────────────────────────────────────────
// tiny is shared with `full` now, so it will be tempting to grow it to serve
// the larger build. This is the line that says no.
const TINY_BUDGET = 3072;
const runtime = readFileSync(join(template, 'dist', 'brometal.js'), 'utf8');
const minified = execFileSync(
  'npx',
  ['esbuild', '--minify', '--loader=js'],
  { input: runtime, encoding: 'utf8', cwd: root },
);
const tinyGzip = gzipSync(Buffer.from(minified), { level: 9 }).length;
if (tinyGzip > TINY_BUDGET) {
  console.error(`\n✗ tiny is ${tinyGzip} bytes gzipped, over its ${TINY_BUDGET} budget`);
  process.exit(1);
}
console.log(`✓ tiny runtime ${tinyGzip} bytes gzipped (budget ${TINY_BUDGET})`);

// ── It has to actually render ─────────────────────────────────────────────
// Building and fitting says nothing about whether it draws. Three runtime bugs
// this session compiled, produced a correctly-sized zip, and rendered nothing —
// and both builds now share a core, so a mistake here breaks them together.
const { chromium } = await import('playwright-core');
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
const page = await browser.newPage({ viewport: { width: 320, height: 220 } });
const failures = [];
page.on('pageerror', (e) => failures.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) failures.push(m.text());
});

// file:// is a secure context, so this is exactly how a player opens it.
await page.goto(`file://${join(template, 'dist', 'index.html')}`, { waitUntil: 'load' });
await page.waitForTimeout(900);
const first = await page.screenshot();
await page.waitForTimeout(250);
const second = await page.screenshot();
await browser.close();

if (failures.length > 0) {
  console.error(`\n✗ the template errored in the browser:\n  ${failures.slice(0, 3).join('\n  ')}`);
  process.exit(1);
}
// Two frames of a rotating cube differ. Two frames of a blank canvas do not —
// which is what every silent failure looked like.
if (Buffer.compare(first, second) === 0) {
  console.error('\n✗ nothing is animating — the canvas rendered the same frame twice');
  process.exit(1);
}
console.log('✓ template renders and animates in Chrome');
