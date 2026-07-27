import type { Metadata } from 'next';
import { EXAMPLE_SECTIONS } from './examples';

export const SITE_URL = 'https://brometal.dev';
export const SITE_NAME = 'BroMetal';

/**
 * One sentence that says what this is, for readers who arrive with no context —
 * a search result, a model summarising the page, someone hovering a link. It
 * leads with the category ("shader compiler") rather than the tagline, because
 * "Lift Shaders. Ship Shredded." is memorable but tells a stranger nothing.
 */
export const SITE_DESCRIPTION =
  'BroMetal compiles a typed TypeScript DSL into GLSL and WGSL at build time, and ships dual WebGL2 + WebGPU runtimes behind one API. No shader compiler in the browser, no scene graph, 8.5 KB gzipped.';

/** Canonical URL for a path like `/examples/shadow`. */
export function canonical(path: string): string {
  return path === '/' ? SITE_URL : `${SITE_URL}${path}`;
}

/**
 * Page metadata with the canonical and social tags filled in.
 *
 * Every page needs its own canonical: without one, a page reachable at more
 * than one URL (a trailing slash, a tracking parameter) splits its ranking
 * between the variants instead of pooling it.
 */
export function pageMetadata(options: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = canonical(options.path);
  return {
    title: options.title,
    description: options.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${options.title} — ${SITE_NAME}`,
      description: options.description,
      url,
      siteName: SITE_NAME,
      type: 'website',
      images: [{ url: '/brometal-og.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${options.title} — ${SITE_NAME}`,
      description: options.description,
      images: ['/brometal-og.png'],
    },
  };
}

export interface ExampleMeta {
  slug: string;
  name: string;
  description: string;
  section: string;
}

/** Every example, flattened out of the sections, in the order they are listed. */
export function allExamples(): ExampleMeta[] {
  return EXAMPLE_SECTIONS.flatMap((section) =>
    section.examples.map((example) => ({ ...example, section: section.title })),
  );
}

export function findExample(slug: string): ExampleMeta | undefined {
  return allExamples().find((example) => example.slug === slug);
}

/**
 * Metadata for an example page, taken from the same registry that renders the
 * index. Keeping one source means a description can never drift between the
 * card that links to a page and the page itself.
 */
export function exampleMetadata(slug: string): Metadata {
  const example = findExample(slug);
  if (example === undefined) {
    throw new Error(`BroMetal site: no example registered with the slug "${slug}"`);
  }
  return pageMetadata({
    title: example.name,
    description: example.description,
    path: `/examples/${example.slug}`,
  });
}

/** Serialises JSON-LD for a <script type="application/ld+json"> tag. */
export function jsonLd(data: Record<string, unknown>): string {
  // `<` is escaped so a value can never close the surrounding script element.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
