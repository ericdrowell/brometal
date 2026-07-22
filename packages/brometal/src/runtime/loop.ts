export interface LoopHandle {
  stop(): void;
}

export function startLoop(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  callback: (elapsedSeconds: number) => void,
): LoopHandle {
  let frameId = 0;
  let running = true;
  let needsResize = true;
  const startedAt = performance.now();

  // ResizeObserver keeps DOM layout reads out of the frame loop — clientWidth /
  // clientHeight force layout work, so we only touch them when size changed.
  const observer =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          needsResize = true;
        })
      : null;
  observer?.observe(canvas);

  const frame = (now: number): void => {
    if (!running) return;
    if (needsResize || observer === null) {
      needsResize = false;
      resizeToDisplaySize(canvas);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    callback((now - startedAt) / 1000);
    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);

  return {
    stop(): void {
      running = false;
      observer?.disconnect();
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
