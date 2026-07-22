/**
 * Preflight for BROMETAL_SOURCE=npm builds: verifies the published package
 * (`brometal-published`) exports everything the local workspace package does.
 * Webpack only *warns* on missing ESM exports, so without this gate a build
 * against a stale published version would deploy and then crash at runtime.
 */
import { pathToFileURL } from 'node:url';

const localEntry = new URL('../../brometal/dist/index.js', import.meta.url);
const local = await import(pathToFileURL(localEntry.pathname).href);
const published = await import('brometal-published');

const missing = Object.keys(local).filter((name) => !(name in published));
if (missing.length > 0) {
  console.error(
    `✗ published brometal package is missing exports the website uses: ${missing.join(', ')}\n` +
      `  The npm registry version is behind the local workspace package.\n` +
      `  Fix: release brometal (npm run release), then run: npm update brometal-published -w website`,
  );
  process.exit(1);
}
console.log('✓ published brometal package covers the local export surface');
