// Build a js13k entry: compile shaders, concatenate, minify, zip, and refuse to
// finish if the result is over budget.
//
// The size gate is the point. Knowing you have 9 kB left changes what you build
// next; finding out on submission day does not.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const LIMIT = 13312; // js13k: 13 * 1024

/** Path to a specific brometal CLI. Unset means the installed one. */
const CLI = process.env.BROMETAL_CLI;

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { cwd: root, stdio: 'pipe', ...opts });
  } catch (error) {
    // Without this the tool's own message is swallowed and the failure surfaces
    // later as a missing file, pointing at the wrong thing entirely.
    process.stderr.write(String(error.stdout ?? ''));
    process.stderr.write(String(error.stderr ?? ''));
    throw error;
  }
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// 1. Shaders → dist/brometal.js + dist/shaders.js
if (CLI) {
  run('node', [CLI, 'prod', '--js13k', root]);
} else {
  run('npx', ['brometal', 'prod', '--js13k', root]);
}

// 2. One program: runtime, then shaders, then the game.
for (const required of ['dist/brometal.js', 'dist/shaders.js']) {
  if (!existsSync(join(root, required))) {
    console.error(
      `\n\u2717 ${required} was not produced.\n` +
        '  The installed brometal does not support --js13k. It needs a version\n' +
        '  that ships the js13k runtime; check the version in package.json.',
    );
    process.exit(1);
  }
}
const combined = ['dist/brometal.js', 'dist/shaders.js', 'src/game.js']
  .map((f) => readFileSync(join(root, f), 'utf8'))
  .join('\n');
const rawPath = join(dist, 'raw.js');
writeFileSync(rawPath, combined);

// 3. Minify the whole thing at once. --toplevel is what lets the mangler rename
// the runtime's API and drop the parts this game never calls; without it those
// names survive at full length.
const outPath = join(dist, 'g.js');
run('npx', [
  'terser', rawPath,
  '--compress', '--mangle', '--toplevel',
  '--format', 'comments=false',
  '-o', outPath,
]);

// 4. Inline the script into the page. One file rather than two: a js13k entry
// is judged as a zip, and every extra member carries its own header and central
// directory record — so two files cost more than the same bytes in one. It also
// makes the result openable straight from disk, since file:// is a secure
// context and WebGPU works there.
const page = readFileSync(join(root, 'src', 'index.html'), 'utf8').replace(
  /<script src=g\.js><\/script>/,
  // Escaping the closing tag guards the case where minified code contains it
  // inside a string, which would end the block early and truncate the game.
  () => `<script>${readFileSync(outPath, 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`,
);
writeFileSync(join(dist, 'index.html'), page);

// 5. Zip — js13k measures the archive, not the files.
let zipBytes = null;
try {
  run('zip', ['-9', '-q', '-j', 'game.zip', 'index.html'], { cwd: dist });
  zipBytes = statSync(join(dist, 'game.zip')).size;
} catch {
  // No zip binary (Windows, minimal CI image). Fall back to the raw total so
  // the build still reports something honest rather than silently passing.
  zipBytes = null;
}

const jsBytes = statSync(join(dist, 'index.html')).size;
const measured = zipBytes ?? jsBytes;
const label = zipBytes === null ? 'index.html (no zip binary)' : 'game.zip';

writeFileSync(
  join(root, '.size.json'),
  JSON.stringify({ js: jsBytes, zip: zipBytes, limit: LIMIT }, null, 2),
);

// The concatenated and minified intermediates have served their purpose; the
// deliverable is one file. Leaving them invites shipping the wrong thing.
rmSync(rawPath, { force: true });
rmSync(outPath, { force: true });

const pct = ((measured / LIMIT) * 100).toFixed(1);
console.log(`  index.html   ${jsBytes} bytes`);
if (zipBytes !== null) console.log(`  game.zip     ${zipBytes} bytes`);
console.log(`  budget       ${measured} / ${LIMIT}  (${pct}%)`);

if (measured > LIMIT) {
  console.error(`\n✗ over budget by ${measured - LIMIT} bytes (${label})`);
  process.exit(1);
}
console.log(`\n✓ ${LIMIT - measured} bytes remaining`);
