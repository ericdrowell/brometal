// Stamps `## Unreleased` with the version being released, and opens a fresh
// empty `## Unreleased` above it.
//
// This writes no content. Entries are written by hand while the work is fresh —
// see CLAUDE.md, which requires an entry alongside any change to
// packages/brometal. What is automated here is only the part that cannot be done
// during development: the version number, which is not chosen until release, and
// the date.
//
// `## Unreleased` is the Keep a Changelog convention and is what this file has
// always used. A placeholder like `x.x.x` would be worse — it sorts oddly, reads
// as a mistake, and gives nothing to link to.

import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (version === undefined || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('✗ usage: node scripts/update-changelog.mjs <version>');
  process.exit(1);
}

const path = new URL('../CHANGELOG.md', import.meta.url);
const original = readFileSync(path, 'utf8');

const heading = '## Unreleased';
const start = original.indexOf(heading);
if (start === -1) {
  console.error(`✗ CHANGELOG.md has no '${heading}' section to promote`);
  process.exit(1);
}

// The section runs to the next top-level heading, or to end of file.
const bodyStart = start + heading.length;
const nextHeading = original.indexOf('\n## ', bodyStart);
const bodyEnd = nextHeading === -1 ? original.length : nextHeading + 1;
const body = original.slice(bodyStart, bodyEnd);

const date = new Date().toISOString().slice(0, 10);
const isEmpty = body.trim() === '';
if (isEmpty) {
  // Not fatal: a release can legitimately carry only internal changes. Recording
  // that explicitly beats a version silently missing from the log, which is how
  // 0.8 through 0.12 ended up undocumented.
  console.warn(`⚠ '${heading}' was empty — recording ${version} as a maintenance release`);
}

// Leading and trailing blank lines are stripped and reapplied so repeated
// promotion cannot drift the spacing.
const promoted = isEmpty
  ? '- No library changes; maintenance release.'
  : body.replace(/^\n+/, '').replace(/\n+$/, '');

writeFileSync(
  path,
  original.slice(0, start) +
    `${heading}\n\n## ${version} (${date})\n\n${promoted}\n\n` +
    original.slice(bodyEnd),
);
console.log(`✓ CHANGELOG.md: Unreleased → ${version} (${date})`);
