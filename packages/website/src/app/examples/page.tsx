import type { Metadata } from 'next';
import { EXAMPLE_SECTIONS } from '@/lib/examples';
import { SITE_URL, allExamples, canonical, jsonLd, pageMetadata } from '@/lib/seo';
import SiteFooter from '@/components/SiteFooter';
import ExampleGallery from '@/components/ExampleGallery';

export const metadata: Metadata = pageMetadata({
  title: 'Examples',
  description:
    '54 live WebGPU examples built with BroMetal: instancing, oceans, games, fractals, prebuilt shaders and interactive GPU art — all compiled from TypeScript to WGSL at build time.',
  path: '/examples',
});

/**
 * The catalogue as data. An ItemList is what lets a search or answer engine
 * enumerate the examples and link straight to the relevant one, instead of
 * treating the index as a wall of undifferentiated links.
 */
const LIST_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  '@id': `${SITE_URL}/examples#list`,
  name: 'BroMetal examples',
  numberOfItems: allExamples().length,
  itemListElement: allExamples().map((example, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: example.name,
    description: example.description,
    url: canonical(`/examples/${example.slug}`),
  })),
};

export default function ExamplesPage() {
  return (
    <main className="page examples-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(LIST_SCHEMA) }}
      />
      <header className="examples-hero">
        <p className="eyebrow">Build with BroMetal</p>
        <h1>The WebGPU engine<br />for AI coding agents.</h1>
        <p>
          {allExamples().length} live examples. Every pixel comes from a TypeScript shader,
          compiled to WGSL before the browser loads. Open one, move it, then read the source.
        </p>
      </header>
      <ExampleGallery sections={EXAMPLE_SECTIONS} />
      <SiteFooter />
    </main>
  );
}
