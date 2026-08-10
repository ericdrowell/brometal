import Link from 'next/link';

/**
 * The site footer.
 *
 * Not in the root layout, unlike the header: an individual example is a
 * full-bleed canvas with its own overlay chrome, and a footer bar underneath it
 * would either push the canvas off-screen or sit on top of the demo. So it is a
 * component each page opts into rather than something every route inherits.
 */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link href="/examples">Examples</Link>
      <span aria-hidden="true"> · </span>
      <a href="https://github.com/ericdrowell/brometal">GitHub</a>
      <span aria-hidden="true"> · </span>
      <Link href="/changelog">Changelog</Link>
      <span aria-hidden="true"> · </span>
      <Link href="/js13k">js13k</Link>
      <span aria-hidden="true"> · </span>
      <a href="https://www.npmjs.com/package/brometal">npm</a>
      <span aria-hidden="true"> · </span>
      <a href="https://discord.gg/fNbTnAQqyg">Discord</a>
    </footer>
  );
}
