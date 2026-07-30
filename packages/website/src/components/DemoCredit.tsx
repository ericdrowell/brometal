/**
 * Byline for the sprite-game demos.
 *
 * Rendered as a line inside a panel or `DemoStats`, so it inherits the surrounding
 * styling and needs no CSS of its own.
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
