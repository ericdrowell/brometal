import Link from 'next/link';
import { EXAMPLES, exampleSourceUrl } from '@/lib/examples';
import { canonical, jsonLd } from '@/lib/seo';

/** Floating prev/next example links, pinned just below the site header. */
export default function ExampleNav({ current }: { current: string }) {
  const index = EXAMPLES.findIndex((example) => example.slug === current);
  if (index === -1) return null;
  const prev = EXAMPLES[index - 1];
  const next = EXAMPLES[index + 1];
  const example = EXAMPLES[index]!;
  // Every example page renders this nav, so the trail lives here rather than
  // being repeated across page files that would drift apart.
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'BroMetal', item: canonical('/') },
      { '@type': 'ListItem', position: 2, name: 'Examples', item: canonical('/examples') },
      {
        '@type': 'ListItem',
        position: 3,
        name: example.name,
        item: canonical(`/examples/${example.slug}`),
      },
    ],
  };
  return (
    <>
      {/* Outside the <nav> so non-visual structured data never participates in
          the carousel controls' layout. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbs) }}
      />
      <nav className="example-nav">
        {prev !== undefined ? (
          <Link className="example-nav-link example-nav-prev" href={`/examples/${prev.slug}`}>
            <b aria-hidden="true">←</b>
            <span><small>Previous</small>{prev.name}</span>
          </Link>
        ) : (
          <span className="example-nav-prev" />
        )}
        <a
          className="example-nav-title"
          href={exampleSourceUrl(example)}
          target="_blank"
          rel="noreferrer"
          title={`${example.name} source on GitHub`}
        >
          <span>{example.name}<small>View source on GitHub</small></span>
          <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </a>
        {next !== undefined ? (
          <Link className="example-nav-link example-nav-next" href={`/examples/${next.slug}`}>
            <span><small>Next</small>{next.name}</span>
            <b aria-hidden="true">→</b>
          </Link>
        ) : (
          <span className="example-nav-next" />
        )}
      </nav>
    </>
  );
}
