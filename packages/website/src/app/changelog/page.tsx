import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo';
import { readChangelog } from '@/lib/changelog';

export const metadata: Metadata = pageMetadata({
  title: 'Changelog',
  description:
    'Every BroMetal release, with what changed and why. Pre-1.0, so minor versions may include breaking changes — each one is listed here.',
  path: '/changelog',
});

/**
 * Inline Markdown: `code`, **bold**, and [links](url).
 *
 * Written out rather than pulled from a library because this page is the only
 * consumer, and the site otherwise runs on four dependencies. The three forms
 * below are all the changelog uses.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      // Entries lead with a bold summary that often contains inline code, so the
      // bold body is parsed again rather than emitted as literal backticks.
      nodes.push(<strong key={key}>{inline(token.slice(2, -2), `${key}-b`)}</strong>);
    } else {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(token)!;
      nodes.push(
        <a key={key} href={link[2]}>
          {link[1]}
        </a>,
      );
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export default function ChangelogPage() {
  const releases = readChangelog();

  return (
    <main className="page">
      <h1>Changelog</h1>
      {releases.map((release) => (
        <section key={release.version} className="changelog-release">
          <h2>{release.version}</h2>
          {release.date !== null && <p className="changelog-date">{release.date}</p>}
          {release.entries.map((entry, entryIndex) => (
            <div key={`${release.version}-${entry.section}-${entryIndex}`}>
              {entry.section !== '' && <h3>{entry.section}</h3>}
              <ul>
                {entry.items.map((item, itemIndex) => (
                  <li key={`${release.version}-${entryIndex}-${itemIndex}`}>
                    {inline(item, `${release.version}-${entryIndex}-${itemIndex}`)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
