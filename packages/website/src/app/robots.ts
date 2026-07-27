import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Everything here is public documentation meant to be read, quoted and
 * summarised — by search crawlers and by the crawlers behind answer engines
 * alike. There is nothing to keep out, so the only job of this file is to
 * point at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
