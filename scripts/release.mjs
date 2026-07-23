import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function exec(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    fail(`${cmd} ${args.join(' ')} failed`);
  }
}

function readVersion() {
  return JSON.parse(
    readFileSync(new URL('../packages/brometal/package.json', import.meta.url), 'utf8'),
  ).version;
}

const bumpType = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  fail(`unknown release type '${bumpType}' — use patch, minor, or major`);
}

// Verify npm auth before touching anything — an expired session would
// otherwise surface only after the version bump and tag are already pushed.
try {
  const user = execSync('npm whoami', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  console.log(`✓ npm session: ${user}`);
} catch {
  fail('not logged in to npm (or the session expired) — run `npm login` first');
}

const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (dirty !== '') {
  fail(`working tree is not clean — commit or stash before releasing:\n${dirty}`);
}

exec('npm', ['version', bumpType, '-w', 'brometal']);
const version = readVersion();
const tag = `v${version}`;

const existingTag = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]);
if (existingTag.status === 0) {
  fail(`tag ${tag} already exists — something is out of sync; resolve manually`);
}

console.log(`Releasing brometal@${version} as ${tag}`);
exec('git', ['commit', '-am', `release brometal ${tag}`]);
exec('git', ['tag', tag]);
exec('git', ['push', 'origin', 'HEAD']);
exec('git', ['push', 'origin', tag]);
// Publish last: if it fails (auth, OTP), the bump + tag are already pushed —
// fix the issue and re-run `npm publish -w brometal` by hand; do not re-run
// the release script, which would bump the version again.
exec('npm', ['publish', '-w', 'brometal']);
console.log(`✓ published brometal@${version} and pushed ${tag}`);

// Point the website's published-package alias at the new version so Vercel
// deploys (which build against the registry package) pick it up.
console.log('Updating brometal-published in the website workspace...');
if (await registryHas(version)) {
  exec('npm', ['update', 'brometal-published', '-w', 'website']);
  const installed = JSON.parse(
    readFileSync(new URL('../node_modules/brometal-published/package.json', import.meta.url), 'utf8'),
  ).version;
  if (installed !== version) {
    console.warn(
      `⚠ brometal-published resolved to ${installed}, expected ${version} — run \`npm update brometal-published -w website\` again shortly`,
    );
  }
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  if (dirty !== '') {
    exec('git', ['commit', '-am', `point website at brometal ${tag}`]);
    exec('git', ['push', 'origin', 'HEAD']);
    console.log(`✓ website now tracks brometal@${installed}`);
  }
} else {
  console.warn(
    `⚠ registry has not served brometal@${version} yet — run \`npm update brometal-published -w website\`, commit, and push once it appears`,
  );
}

async function registryHas(expected) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const latest = execSync('npm view brometal version', { encoding: 'utf8' }).trim();
      if (latest === expected) return true;
    } catch {
      // registry hiccup — retry below
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}
