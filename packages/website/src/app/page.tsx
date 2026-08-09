import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import localFont from 'next/font/local';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, jsonLd } from '@/lib/seo';

const delogs = localFont({ src: '../../public/fonts/Delogs Goes Hi-Tech.otf' });

export const metadata: Metadata = {
  // Absolute, or the root layout's template would render "BroMetal — BroMetal".
  title: { absolute: `${SITE_NAME} — TypeScript shaders for WebGPU` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: SITE_URL },
};

/**
 * Questions people actually ask before adopting a graphics library, answered in
 * full sentences that stand on their own.
 *
 * This is the part answer engines quote. An answer only survives being lifted
 * out of the page if it repeats its own subject — "BroMetal compiles..." rather
 * than "It compiles..." — so each one does, at the cost of reading a little
 * stiffly in sequence.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'What is BroMetal?',
    a: 'BroMetal is a WebGPU graphics library that compiles shaders written in a typed TypeScript DSL into WGSL ahead of time. You write shaders as TypeScript functions, a build step turns each one into a generated module, and your app imports it. The compiler never reaches the browser.',
  },
  {
    q: 'How is BroMetal different from Three.js?',
    a: 'Three.js is a scene graph with a material system that generates shader code in the browser at runtime. BroMetal has neither: shaders are compiled on your machine at build time, and there is no scene graph, no material system and no runtime shader generation. That makes BroMetal much smaller and removes first-frame shader compilation, at the cost of doing the work Three.js does for you — you write the shader yourself.',
  },
  {
    q: 'How large is the BroMetal runtime?',
    a: 'A typical BroMetal app — renderer, program, camera, a geometry generator and the matrix helpers — bundles to about 19 KB minified and 7 KB gzipped. The compiler and CLI are build-time only and are never included, and unused shader functions are tree-shaken away because they inline into shader text rather than shipping as runtime code.',
  },
  {
    q: 'Can I use BroMetal with js13k?',
    a: 'Yes — the core of BroMetal was built for it. `brometal prod --js13k` emits a WebGPU runtime as plain global functions that minifies to about 2 KB gzipped, plus your shaders as compact arrays. Because shaders are compiled to WGSL on your machine, the compiler never counts against the 13 KB budget, and a shader mistake is a build error rather than a black screen. A working starter — runtime, a shader and a spinning textured cube — zips to about 3 KB, leaving roughly 10 KB for the game. See brometal.dev/js13k for the runtime source and instructions.',
  },
  {
    q: 'Why is BroMetal WebGPU-only?',
    a: 'Because the features worth building on do not exist in WebGL2. Compute shaders and storage buffers have no WebGL2 equivalent, and supporting both meant every feature had to be expressible in the older API. WebGPU now ships in Chrome, Edge, Firefox 141+ and Safari 26+, so the compiler emits WGSL alone and `createRenderer` throws where WebGPU is unavailable.',
  },
  {
    q: 'Do I need to know WGSL to use BroMetal?',
    a: 'No. Shaders are written in TypeScript using a typed subset of the language — vectors, matrices, swizzles, loops and helper functions — and the compiler emits WGSL for you. Knowing how shaders work still helps, since you are writing one, but you never write shader-language syntax.',
  },
  {
    q: 'Does BroMetal compile shaders in the browser?',
    a: 'No. Each `name.shader.ts` file compiles to a `name.shader.gen.ts` module during your build, containing finished shader text plus typed interface metadata. The browser receives that generated module. Nothing is parsed, type-checked or code-generated at runtime, so there is no compilation cost on the first frame.',
  },
  {
    q: 'Which browsers does BroMetal support?',
    a: 'Any browser with WebGPU: Chrome and Edge 113+, Firefox 141+, and Safari 26+, on desktop and on Android. BroMetal is WebGPU-only, so `createRenderer` throws with a clear message rather than degrading where it is missing.',
  },
  {
    q: 'Is BroMetal free and open source?',
    a: 'Yes. BroMetal is MIT licensed, published on npm as `brometal`, and developed in the open at github.com/ericdrowell/brometal.',
  },
];

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${SITE_URL}/#faq`,
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

export default function HomePage() {
  return (
    <main className="page hero">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(FAQ_SCHEMA) }} />
      <h1 className={`hero-title ${delogs.className}`}>BroMetal</h1>
      <Image
        src="/bro-metal-head-blue.png"
        alt="The BroMetal logo: a bro's head wearing sunglasses"
        width={1254}
        height={1254}
        priority
        className="hero-head"
      />
      <p className="tagline">&ldquo;Write TypeScript.&nbsp;&nbsp;Lift Shaders.&nbsp;&nbsp;Ship Shredded.&rdquo;</p>
      <p className="subhead">
        Typed shaders compiled at build time &mdash; WebGPU, no compiler in the browser.
      </p>
      <a
        className="cta"
        href="https://www.npmjs.com/package/brometal"
        target="_blank"
        rel="noreferrer"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
        </svg>
        Install
      </a>
      <section className="ethos">
        <h2>Ethos</h2>
        <p>
          Built for the AI coding era. Everything is TypeScript and compiles into WGSL at build
          time, with no scene graph and no compiler in the browser. A typical app bundles to about
          19&nbsp;KB minified and 7&nbsp;KB gzipped, because material systems and runtime shader
          generation are simply never shipped. Less to download, nothing to generate at startup.
          The first frame hits instantly.
        </p>
      </section>
      <section className="faq">
        <h2>Frequently asked questions</h2>
        <dl>
          {FAQ.map((item) => (
            <div key={item.q} className="faq-item">
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
      <footer className="home-footer">
        <Link href="/changelog">Changelog</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/examples">Examples</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/js13k">js13k</Link>
        <span aria-hidden="true"> · </span>
        <a href="https://github.com/ericdrowell/brometal">GitHub</a>
        <span aria-hidden="true"> · </span>
        <a href="https://www.npmjs.com/package/brometal">npm</a>
        <span aria-hidden="true"> · </span>
        <a href="https://discord.gg/fNbTnAQqyg">Discord</a>
      </footer>
    </main>
  );
}
