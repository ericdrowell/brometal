/**
 * Byline for the sprite-game demos. Lives here rather than in `src/components`
 * so everything these demos depend on sits under `sprite-lib/`.
 *
 * Rendered as a line inside `DemoStats`, so it inherits the `.hud` styling and
 * needs no CSS of its own.
 */
export default function DemoCredit() {
  return (
    <>
      Demo by{' '}
      <a href="https://github.com/shadowcodex" target="_blank" rel="noopener noreferrer">
        shadowcodex
      </a>
    </>
  );
}
