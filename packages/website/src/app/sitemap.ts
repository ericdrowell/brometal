import type { MetadataRoute } from 'next';
import { allExamples, canonical } from '@/lib/seo';

/**
 * Generated from the same registry that renders the examples index, so a new
 * example is listed the moment it is added. A hand-maintained sitemap is a
 * sitemap that silently goes stale.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // The build stamps one date across the site rather than reading file mtimes,
  // which would report "today" for every page on every deploy and teach
  // crawlers to ignore the field.
  const lastModified = new Date();

  return [
    { url: canonical('/'), lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: canonical('/examples'), lastModified, changeFrequency: 'weekly', priority: 0.9 },
    ...allExamples().map((example) => ({
      url: canonical(`/examples/${example.slug}`),
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
