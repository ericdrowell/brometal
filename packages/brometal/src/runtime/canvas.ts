/**
 * Match a canvas's drawing buffer to its CSS display size.
 *
 * A zero client size can be reported transiently while the canvas is detached
 * or an ancestor is not being laid out. Do not write that measurement back to
 * the width/height attributes: for an intrinsically sized canvas, doing so
 * changes its next client size and permanently collapses it to the 1px clamp.
 */
export function resizeToDisplaySize(canvas: HTMLCanvasElement, dpr: number): void {
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
