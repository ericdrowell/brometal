import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const websiteRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const outputDir = join(websiteRoot, 'public', 'examples');
const baseUrl = process.env.BROMETAL_SCREENSHOT_URL ?? 'http://localhost:3005';
const only = process.argv.slice(2);

mkdirSync(outputDir, { recursive: true });

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

const context = await browser.newContext({
  viewport: { width: 960, height: 540 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
});
const page = await context.newPage();

try {
  console.log(`Reading examples from ${baseUrl}/examples`);
  await page.goto(`${baseUrl}/examples`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.locator('a[href^="/examples/"]').first().waitFor({ state: 'visible', timeout: 20_000 });
  const allSlugs = await page.locator('a[href^="/examples/"]').evaluateAll((links) => {
    return [...new Set(links
      .map((link) => link.getAttribute('href'))
      .filter((href) => /^\/examples\/[^/?#]+$/.test(href ?? ''))
      .map((href) => href.split('/').at(-1))
      .filter(Boolean))];
  });
  const slugs = only.length === 0 ? allSlugs : allSlugs.filter((slug) => only.includes(slug));

  if (slugs.length === 0) {
    throw new Error('No matching examples found. Is the website running?');
  }

  const failures = [];
  console.log(`Capturing ${slugs.length} examples at 960×540`);
  for (const [index, slug] of slugs.entries()) {
    const browserErrors = [];
    const onPageError = (error) => browserErrors.push(error.message);
    const onConsole = (message) => {
      if (message.type() === 'error' && !message.text().includes('favicon')) {
        browserErrors.push(message.text());
      }
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);

    try {
      await page.goto(`${baseUrl}/examples/${slug}?embed=1`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 15_000 });

      // The shared FPS counter is the cheapest reliable proof that a renderer
      // has made it through device and pipeline creation and is drawing frames.
      await page.waitForFunction(() => {
        const counter = document.querySelector('.hud strong');
        return counter !== null && !counter.textContent?.trim().startsWith('0 ');
      }, { timeout: 10_000 });

      const visibleError = await page.locator('.error-toast').allTextContents();
      if (visibleError.length > 0) throw new Error(visibleError.join(' '));

      await page.addStyleTag({ content: `
        .site-header, .example-nav, .panels, .code-panel,
        .showcase-caption, .hud, .error-toast, nextjs-portal { display: none !important; }
        html, body { overflow: hidden !important; }
      ` });
      await page.waitForTimeout(450);

      const path = join(outputDir, `${slug}.jpg`);
      await page.screenshot({ path, type: 'jpeg', quality: 88 });
      const bytes = statSync(path).size;
      if (bytes < 1_500) throw new Error(`suspiciously small capture (${bytes} bytes)`);

      console.log(`${String(index + 1).padStart(2, '0')}/${slugs.length}  ${slug}.jpg  ${bytes} bytes`);
      if (browserErrors.length > 0) {
        failures.push(`${slug}: ${browserErrors.join(' | ')}`);
      }
    } catch (error) {
      failures.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
    }
  }

  if (failures.length > 0) {
    console.error('\nCapture warnings:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`\nCaptured ${slugs.length} examples in ${outputDir}`);
  }
} finally {
  await context.close();
  await browser.close();
}
