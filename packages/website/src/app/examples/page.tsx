import type { Metadata } from 'next';
import Link from 'next/link';
import { EXAMPLE_SECTIONS } from '@/lib/examples';
import { SITE_URL, allExamples, canonical, jsonLd, pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Examples',
  description:
    'Live WebGL2 and WebGPU examples built with BroMetal: instancing, shadow mapping, GPU physics, Gerstner ocean waves, a block world and a flight game — each one a typed TypeScript shader compiled at build time.',
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
    <main className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(LIST_SCHEMA) }}
      />
      <h1>Examples</h1>
      <p className="page-intro">
        Every example below is a live WebGL2 or WebGPU scene, drawn by shaders written in
        TypeScript and compiled to GLSL and WGSL at build time. Each one picks whichever backend
        your browser supports and shows which it chose.
      </p>
      {EXAMPLE_SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 className="example-section-title">{section.title}</h2>
          <ul className="example-list">
            {section.examples.map((example) => (
              <li key={example.slug}>
                <Link href={`/examples/${example.slug}`}>
                  <div className="name">{example.name}</div>
                  <div className="desc">{example.description}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
