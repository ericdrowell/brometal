import Link from 'next/link';
import { EXAMPLES } from '@/lib/examples';

/** Floating prev/next example links, pinned just below the site header. */
export default function ExampleNav({ current }: { current: string }) {
  const index = EXAMPLES.findIndex((example) => example.slug === current);
  if (index === -1) return null;
  const prev = EXAMPLES[index - 1];
  const next = EXAMPLES[index + 1];
  return (
    <nav className="example-nav">
      {prev !== undefined ? (
        <Link className="example-nav-link" href={`/examples/${prev.slug}`}>
          ← {prev.name}
        </Link>
      ) : (
        <span />
      )}
      <div className="example-nav-title">{EXAMPLES[index]!.name}</div>
      {next !== undefined ? (
        <Link className="example-nav-link" href={`/examples/${next.slug}`}>
          {next.name} →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
