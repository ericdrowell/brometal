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
const commitMessage = process.argv[3];

// Verify npm auth before touching anything — an expired session would
// otherwise surface only after the version bump and tag are already pushed.
try {
  const user = execSync('npm whoami', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  console.log(`✓ npm session: ${user}`);
} catch {
  fail('not logged in to npm (or the session expired) — run `npm login` first');
}

// Uncommitted work can ride along with the release: pass a commit message as
// the second argument and it is committed and pushed as part of the release,
// so the Vercel deploy triggered by the push builds against the fresh publish
// instead of failing the preflight.
const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (dirty !== '') {
  if (commitMessage === undefined || commitMessage.trim() === '') {
    fail(
      `working tree is not clean — either commit yourself, or pass a commit message to fold the changes into the release:\n` +
        `  npm run release ${bumpType} "your commit message"\n${dirty}`,
    );
  }
  console.log('Committing working tree as part of the release...');
  exec('git', ['add', '-A']);
  exec('git', ['commit', '-m', commitMessage]);
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
// Publish BEFORE pushing: the push below is what triggers the Vercel deploy,
// so by holding it until the registry serves the new version (and the lockfile
// points at it), the deploy builds green on the first try. If publish fails
// (auth, OTP), everything is still local — fix the issue, then run by hand:
//   npm publish -w brometal
//   npm update brometal-published -w website
//   git commit -am "point website at brometal <tag>" && git push origin HEAD --tags
exec('npm', ['publish', '-w', 'brometal']);
console.log(`✓ published brometal@${version}`);

// Point the website's published-package alias at the new version so the
// deploy triggered by the push builds against the fresh release.
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
  const lockfileDirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  if (lockfileDirty !== '') {
    exec('git', ['commit', '-am', `point website at brometal ${tag}`]);
  }
} else {
  console.warn(
    `⚠ registry has not served brometal@${version} yet — run \`npm update brometal-published -w website\`, commit, and push once it appears`,
  );
}

exec('git', ['push', 'origin', 'HEAD']);
exec('git', ['push', 'origin', tag]);
console.log(`✓ pushed ${tag} — the triggered deploy builds against brometal@${version}`);

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
