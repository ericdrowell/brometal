import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { BROMETAL_VERSION } from '@/lib/version';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, jsonLd } from '@/lib/seo';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // `%s` is filled by each page's own title; the home page overrides the
  // template with `absolute` so it does not read "BroMetal — BroMetal".
  title: {
    default: `${SITE_NAME} — TypeScript shaders for WebGL2 and WebGPU`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: 'Eric Rowell', url: 'https://github.com/ericdrowell' }],
  creator: 'Eric Rowell',
  category: 'technology',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: `${SITE_NAME} — TypeScript shaders for WebGL2 and WebGPU`,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    url: SITE_URL,
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/brometal-og.png', width: 1200, height: 630, alt: 'BroMetal' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — TypeScript shaders for WebGL2 and WebGPU`,
    description: SITE_DESCRIPTION,
    images: ['/brometal-og.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

/**
 * What the site is, in a form a machine can read without parsing prose. Search
 * engines use it for rich results; answer engines use it to establish what the
 * project *is* before quoting anything from the page.
 */
const SITE_SCHEMA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: 'en',
      publisher: { '@id': `${SITE_URL}/#author` },
    },
    {
      '@type': 'Person',
      '@id': `${SITE_URL}/#author`,
      name: 'Eric Rowell',
      url: 'https://github.com/ericdrowell',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: SITE_NAME,
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'Graphics library',
      operatingSystem: 'Any browser supporting WebGL2 or WebGPU',
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      softwareVersion: BROMETAL_VERSION,
      programmingLanguage: ['TypeScript', 'GLSL', 'WGSL'],
      license: 'https://opensource.org/licenses/MIT',
      author: { '@id': `${SITE_URL}/#author` },
      downloadUrl: 'https://www.npmjs.com/package/brometal',
      codeRepository: 'https://github.com/ericdrowell/brometal',
      // A free library still needs an offer for the price to be stated at all.
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          // React escapes text children of <script>, so the JSON has to go in raw.
          dangerouslySetInnerHTML={{ __html: jsonLd(SITE_SCHEMA) }}
        />
        <header className="site-header">
          <Link href="/" className="brand">
            BroMetal
            <span className="version">v{BROMETAL_VERSION}</span>
          </Link>
          <nav>
            <Link href="/examples">Examples</Link>
            <a
              href="https://github.com/ericdrowell/brometal"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository"
              title="GitHub"
              className="icon-link"
            >
              <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
            </a>
            <a
              href="https://www.npmjs.com/package/brometal"
              target="_blank"
              rel="noreferrer"
              aria-label="npm package"
              title="npm"
              className="icon-link"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
              </svg>
            </a>
            <a
              href="https://discord.gg/fNbTnAQqyg"
              target="_blank"
              rel="noreferrer"
              aria-label="Discord community"
              title="Discord"
              className="icon-link"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.291.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
          </nav>
        </header>
        {children}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-S4HZSWEX2P"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-S4HZSWEX2P');`}
        </Script>
      </body>
    </html>
  );
}
