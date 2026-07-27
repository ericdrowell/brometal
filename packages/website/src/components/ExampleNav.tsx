import Link from 'next/link';
import { EXAMPLES } from '@/lib/examples';
import { canonical, jsonLd } from '@/lib/seo';

/** Floating prev/next example links, pinned just below the site header. */
export default function ExampleNav({ current }: { current: string }) {
  const index = EXAMPLES.findIndex((example) => example.slug === current);
  if (index === -1) return null;
  const prev = EXAMPLES[index - 1];
  const next = EXAMPLES[index + 1];
  const example = EXAMPLES[index]!;
  // Every example page renders this nav, so the trail lives here rather than
  // being repeated in eighteen page files that would drift apart.
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
      {/* Outside the <nav>, not inside it: the nav is a grid whose first and
          last children are positioned with :first-child / :last-child, and a
          script tag still counts for those even though it renders nothing. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbs) }}
      />
      <nav className="example-nav">
        {prev !== undefined ? (
          <Link className="example-nav-link example-nav-prev" href={`/examples/${prev.slug}`}>
            ← {prev.name}
          </Link>
        ) : (
          <span className="example-nav-prev" />
        )}
        <div className="example-nav-title">{example.name}</div>
        {next !== undefined ? (
          <Link className="example-nav-link example-nav-next" href={`/examples/${next.slug}`}>
            {next.name} →
          </Link>
        ) : (
          <span className="example-nav-next" />
        )}
      </nav>
    </>
  );
}
