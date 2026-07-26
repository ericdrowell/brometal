/**
 * Canvas sizing.
 *
 * BroMetal's contract is that CSS sizes the canvas and the runtime owns the
 * drawing buffer — the same split WebGL Fundamentals teaches and react-three-
 * fiber ships. The `width`/`height` attributes are never read, and never
 * written except to match the CSS box.
 *
 * The contract is not decorative. A canvas with no CSS size takes its layout
 * box *from* its drawing buffer, so measuring the box to size the buffer feeds
 * output back into input: the buffer doubles every pass on a HiDPI screen, and
 * a single zero read latches it to 1x1 forever. Rather than guess, the runtime
 * establishes which way the dependency runs — nudge the buffer, see whether
 * the box follows — and where the canvas has no CSS size it leaves the buffer
 * exactly as authored and says so once. No runaway, no collapse, and no inline
 * styles written behind the author's back.
 */

type Sizing = 'css' | 'unstyled';

const SIZING = new WeakMap<HTMLCanvasElement, Sizing>();
const warned = new WeakSet<HTMLCanvasElement>();

/** Large enough that no layout could coincidentally land on the probe value. */
const PROBE_DELTA = 64;

/**
 * Returns null when the canvas has no layout box yet (detached, or
 * `display: none`), in which case nothing can be decided and nothing is
 * touched — the caller tries again on a later frame.
 */
function classify(canvas: HTMLCanvasElement): Sizing | null {
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth <= 0 || cssHeight <= 0) {
    return null;
  }

  // Nudge the drawing buffer and re-read the layout box. This runs once per
  // canvas, before anything has been drawn, so the buffer reset it causes
  // costs nothing.
  const bufferWidth = canvas.width;
  const bufferHeight = canvas.height;
  canvas.width = bufferWidth + PROBE_DELTA;
  canvas.height = bufferHeight + PROBE_DELTA;
  const probedWidth = canvas.clientWidth;
  const probedHeight = canvas.clientHeight;
  canvas.width = bufferWidth;
  canvas.height = bufferHeight;

  // A zero read mid-probe says nothing about which way the dependency runs.
  // Leave it unclassified and try again next frame.
  if (probedWidth <= 0 || probedHeight <= 0) {
    return null;
  }
  return probedWidth !== cssWidth || probedHeight !== cssHeight ? 'unstyled' : 'css';
}

function warnUnstyled(canvas: HTMLCanvasElement): void {
  if (warned.has(canvas)) return;
  warned.add(canvas);
  console.warn(
    `BroMetal: the canvas has no CSS size, so its drawing buffer is left at ` +
      `${canvas.width}x${canvas.height} — it will not fill its container or ` +
      `sharpen on a high-DPI display. Size it with CSS instead of the width/height ` +
      `attributes, e.g. \`canvas { display: block; width: 100%; height: 100%; ` +
      `min-width: 0; min-height: 0 }\` on a container that has a size of its own.`,
  );
}

/**
 * Matches a canvas's drawing buffer to its CSS display size, scaled by the
 * device pixel ratio. A canvas with no CSS size is left alone.
 */
export function resizeToDisplaySize(canvas: HTMLCanvasElement, dpr: number): void {
  let sizing = SIZING.get(canvas);
  if (sizing === undefined) {
    const classified = classify(canvas);
    if (classified === null) {
      return;
    }
    sizing = classified;
    SIZING.set(canvas, sizing);
  }
  if (sizing === 'unstyled') {
    warnUnstyled(canvas);
    return;
  }

  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  if (displayWidth <= 0 || displayHeight <= 0) {
    return;
  }

  const width = Math.max(1, Math.floor(displayWidth * dpr));
  const height = Math.max(1, Math.floor(displayHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}
