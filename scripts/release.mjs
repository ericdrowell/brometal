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
// so the Vercel deploy triggered by the push follows the fresh publication.
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

// Stamp the accumulated notes with this version. Entries are hand-written during
// development under `## Unreleased` (see CLAUDE.md); only the version and date
// are added here, because the version is not chosen until now.
exec('node', ['scripts/update-changelog.mjs', version]);

// Regenerate the package's copies AFTER the stamp, so the CHANGELOG.md mirrored
// into the package carries the version just assigned. Running this before
// release.mjs would leave the tree dirty at the check above and demand a commit
// message on every release.
exec('node', ['scripts/sync-examples.mjs']);

// `git commit -am` stages only tracked files, and the synced examples are
// untracked the first time they appear — so stage everything explicitly.
exec('git', ['add', '-A']);
exec('git', ['commit', '-m', `release brometal ${tag}`]);
exec('git', ['tag', tag]);
// Publish before pushing so a failed authentication or OTP challenge leaves
// the release commit and tag local. The website always builds the workspace
// package, so deployment does not need to wait for npm registry propagation.
exec('npm', ['publish', '-w', 'brometal']);
console.log(`✓ published brometal@${version}`);
exec('node', ['scripts/smoke-published.mjs', version]);

exec('git', ['push', 'origin', 'HEAD']);
exec('git', ['push', 'origin', tag]);
console.log(`✓ pushed ${tag} — the triggered deploy builds against brometal@${version}`);
