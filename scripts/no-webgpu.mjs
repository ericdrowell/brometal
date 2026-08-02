// Opens Chrome with `navigator.gpu` removed, to check what an unsupported
// browser actually sees — the website should show its error toast rather than a
// blank canvas.
//
//   node scripts/no-webgpu.mjs                       # local dev site
//   node scripts/no-webgpu.mjs https://brometal.dev/examples/day-ocean
//
// Why a script rather than a Chrome flag: there isn't one. WebGPU ships as a
// stable API in current Chrome and none of --disable-features=WebGPU,
// --disable-blink-features=WebGPU or --disable-dawn-features removes
// navigator.gpu — all were tried, all left it in place. --disable-gpu is not the
// same test either: it leaves navigator.gpu present and makes requestAdapter()
// return null, which is a different failure path.
//
// A DevTools console cannot do this, because the detection runs during page
// load and the console only gets a turn afterwards. This injects before any page
// script, which is the whole trick.

import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:3005/examples/day-ocean';

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: false });
} catch (error) {
  console.error(`✗ could not launch Chrome: ${String(error).split('\n')[0]}`);
  process.exit(1);
}

const page = await browser.newPage({ viewport: null });
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'gpu', { get: () => undefined, configurable: true });
});

page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

try {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
} catch (error) {
  console.error(`✗ could not load ${url}: ${String(error).split('\n')[0]}`);
  console.error('  is the dev server running? `npm run dev:website`');
  await browser.close();
  process.exit(1);
}

console.log(`\n✓ ${url} loaded with navigator.gpu removed`);
console.log('  expect a toast reading "WebGPU not enabled"');
console.log('  close the browser window to exit\n');

// Stay open until the window is closed by hand.
await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
await browser.close().catch(() => {});
