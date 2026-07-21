export interface LoopHandle {
  stop(): void;
}

export function startLoop(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  clearColor: readonly [number, number, number, number],
  callback: (elapsedSeconds: number) => void,
): LoopHandle {
  let frameId = 0;
  let running = true;
  const startedAt = performance.now();

  const frame = (now: number): void => {
    if (!running) return;
    resizeToDisplaySize(canvas);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    callback((now - startedAt) / 1000);
    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);

  return {
    stop(): void {
      running = false;
      cancelAnimationFrame(frameId);
    },
  };
}

function resizeToDisplaySize(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}
