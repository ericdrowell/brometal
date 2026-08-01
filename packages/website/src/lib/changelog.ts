import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The changelog, parsed from the repository's CHANGELOG.md at build time.
 *
 * One source of truth, three places to read it: the file on GitHub, this page,
 * and the copy shipped inside the npm package. Rendering the file rather than
 * maintaining a second copy is the only way those three cannot drift.
 *
 * The parser handles the subset of Markdown the changelog actually uses —
 * headings, bullets, bold, inline code and links. That is deliberate: pulling in
 * a Markdown library for one page would triple the site's dependency count, and
 * this file's shape is enforced by CLAUDE.md rather than by chance.
 */

export interface ChangelogEntry {
  /** 'Added' | 'Changed' | 'Fixed' | 'Removed', or '' for unsectioned bullets. */
  section: string;
  items: string[];
}

export interface ChangelogRelease {
  /** 'Unreleased', or a version like '0.12.3'. */
  version: string;
  /** ISO date, or null for Unreleased. */
  date: string | null;
  entries: ChangelogEntry[];
}

function locate(): string {
  // process.cwd() is packages/website under both `next dev` and `next build`.
  return join(process.cwd(), '..', '..', 'CHANGELOG.md');
}

export function readChangelog(): ChangelogRelease[] {
  const source = readFileSync(locate(), 'utf8');
  const releases: ChangelogRelease[] = [];

  let release: ChangelogRelease | null = null;
  let entry: ChangelogEntry | null = null;

  for (const raw of source.split('\n')) {
    const versionHeading = /^##\s+(.+?)(?:\s*[(—]\s*(\d{4}-\d{2}-\d{2})\)?)?\s*$/.exec(raw);
    if (versionHeading !== null && !raw.startsWith('###')) {
      release = { version: versionHeading[1]!.trim(), date: versionHeading[2] ?? null, entries: [] };
      releases.push(release);
      entry = null;
      continue;
    }
    if (release === null) continue;

    const sectionHeading = /^###\s+(.+?)\s*$/.exec(raw);
    if (sectionHeading !== null) {
      entry = { section: sectionHeading[1]!.trim(), items: [] };
      release.entries.push(entry);
      continue;
    }

    const bullet = /^-\s+(.*)$/.exec(raw);
    if (bullet !== null) {
      if (entry === null) {
        entry = { section: '', items: [] };
        release.entries.push(entry);
      }
      entry.items.push(bullet[1]!);
      continue;
    }

    // A wrapped continuation of the previous bullet. Changelog entries here run
    // to several lines, and joining them keeps the rendered text one paragraph.
    if (entry !== null && entry.items.length > 0 && /^\s+\S/.test(raw)) {
      entry.items[entry.items.length - 1] += ` ${raw.trim()}`;
    }
  }

  return releases;
}
