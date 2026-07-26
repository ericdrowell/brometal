/**
 * Match a canvas's drawing buffer to its CSS display size.
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
