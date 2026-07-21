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
