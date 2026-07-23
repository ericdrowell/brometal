import Image from 'next/image';

export default function HomePage() {
  return (
    <main className="page hero">
      <Image
        src="/bro-metal-logo.png"
        alt="BroMetal"
        width={1024}
        height={326}
        priority
        className="hero-logo"
      />
      <Image
        src="/bro-metal-head-blue.png"
        alt="A bro's head wearing sunglasses"
        width={1254}
        height={1254}
        priority
        className="hero-head"
      />
      <p className="tagline">&ldquo;Write TypeScript.&nbsp;&nbsp;Lift Shaders.&nbsp;&nbsp;Ship Shredded.&rdquo;</p>
      <p className="subhead">
        Typed shaders compiled at build time &mdash; WebGL2 + WebGPU from one source, ~10KB runtime.
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
    </main>
  );
}
