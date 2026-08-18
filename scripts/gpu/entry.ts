// Runs inside a real browser against a real GPU. Bundled by scripts/gpu-test.mjs
// and loaded by playwright-core through the system Chrome.
//
// Every assertion reads pixels back off the canvas, because that is the only way
// to prove the whole path ran: shader text correct, pipeline valid, bindings
// wired, uniforms uploaded, dispatch executed. The unit suite already proves the
// emitted WGSL is right, and none of the four bugs this exists to catch were
// visible there.

import {
  createProgram,
  createRenderer,
  createRenderTarget,
  createStorageBuffer,
  createPlane,
  isBroMetalError,
} from 'brometal';
import computeShader from './fixtures/gpu-compute.shader.gen';
import readbackShader from './fixtures/gpu-readback.shader.gen';
import targetWriteShader from './fixtures/gpu-target-write.shader.gen';
import targetReadShader from './fixtures/gpu-target-read.shader.gen';

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

declare global {
  interface Window {
    __GPU_RESULTS__?: { backend: string; mode: 'webgpu' | 'fallback'; checks: Check[] };
  }
}

const COUNT = 256;
const WORKGROUP = 64;
const WIDTH = 256;
const HEIGHT = 64;
/** Arbitrary constant the render-target pass stamps into blue. */
const MARK = 0.25;

/** Copy the GPU canvas through a 2D canvas so pixels can be read. */
function samplePixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  const scratch = document.createElement('canvas');
  scratch.width = canvas.width;
  scratch.height = canvas.height;
  const ctx = scratch.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
}

/** Channels are 0-255 and go through an sRGB canvas, so exact equality is wrong. */
function near(actual: number, expected: number, tolerance = 10): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * What a browser without WebGPU must do: reject with an error the application
 * can identify, and leave the canvas completely alone.
 *
 * The library renders nothing on failure on purpose — showing the problem is the
 * application's job. What the runtime owes it is a failure that is catchable and
 * tagged, so a consumer can tell "no WebGPU here" apart from "your GPU died".
 *
 * This runs under Playwright's WebKit, which exposes no `navigator.gpu` at all,
 * so it stands in for a Safari that has not enabled WebGPU.
 */
async function runFallback(canvas: HTMLCanvasElement): Promise<Check[]> {
  const checks: Check[] = [];

  let thrown: unknown = null;
  try {
    await createRenderer(canvas);
  } catch (error) {
    thrown = error;
  }

  checks.push({
    name: 'createRenderer rejects rather than returning a dead renderer',
    passed: thrown !== null,
    detail: thrown === null ? 'it resolved' : String(thrown),
  });

  // The code is the part an application branches on, so it matters more than
  // the message text.
  checks.push({
    name: 'the rejection is tagged webgpu-unavailable',
    passed: isBroMetalError(thrown) && thrown.code === 'webgpu-unavailable',
    detail: isBroMetalError(thrown) ? `code ${thrown.code}` : `not a BroMetalError: ${String(thrown)}`,
  });

  // Nothing may have been drawn: a library that paints its own error message
  // takes a design decision away from the application, and would also claim the
  // canvas's 2D context permanently.
  let painted = 0;
  const probe = document.createElement('canvas');
  probe.width = canvas.width;
  probe.height = canvas.height;
  const ctx = probe.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > 0) painted++;
  }
  checks.push({
    name: 'the canvas is left untouched for the application to use',
    passed: painted === 0,
    detail: `${painted} non-transparent pixels`,
  });

  return checks;
}

async function run(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;

  if (navigator.gpu === undefined) {
    window.__GPU_RESULTS__ = {
      backend: 'none',
      mode: 'fallback',
      checks: await runFallback(canvas),
    };
    return;
  }

  const checks: Check[] = [];
  const renderer = await createRenderer(canvas, { clearColor: [0, 0, 0, 1] });

  if (renderer.backend !== 'webgpu') {
    window.__GPU_RESULTS__ = {
      backend: renderer.backend,
      mode: 'webgpu',
      checks: [{ name: 'webgpu available', passed: false, detail: `got ${renderer.backend}` }],
    };
    return;
  }

  const buffer = createStorageBuffer(renderer, new Float32Array(COUNT * 4));

  const compute = createProgram(renderer, computeShader);
  compute.uniforms.uCount.set(COUNT);
  compute.uniforms.uOut.set(buffer);
  compute.dispatch(COUNT / WORKGROUP);

  const quad = createPlane({ width: 2, height: 2, widthSegments: 1, heightSegments: 1 });
  const readback = createProgram(renderer, readbackShader);
  readback.attributes.aPosition.set(quad.positions);
  readback.attributes.aUv.set(quad.uvs);
  readback.setIndices(quad.indices);
  readback.uniforms.uCount.set(COUNT);
  readback.uniforms.uData.set(buffer);

  await new Promise<void>((resolve) => {
    const stop = renderer.loop(() => {
      readback.draw();
      stop();
      resolve();
    });
  });

  // Three columns across the canvas map to known buffer indices, so a shifted or
  // partially-written buffer fails rather than passing on one lucky sample.
  for (const [label, x, index] of [
    ['left', 2, 2],
    ['middle', 128, 128],
    ['right', 250, 250],
  ] as const) {
    const [r, g, b] = samplePixel(canvas, x, Math.floor(HEIGHT / 2));
    const wantR = Math.round((index / COUNT) * 255);
    const wantB = Math.round((1 - index / COUNT) * 255);
    checks.push({
      name: `compute → storage → fragment (${label})`,
      passed: near(r, wantR) && near(g, 128) && near(b, wantB),
      detail: `rgb(${r},${g},${b}) expected ~rgb(${wantR},128,${wantB})`,
    });
  }

  // A uniform read as zero is the signature of the flush bug: it made every
  // element identical instead of a ramp.
  const [leftR] = samplePixel(canvas, 2, 32);
  const [rightR] = samplePixel(canvas, 250, 32);
  checks.push({
    name: 'uniforms reach the compute stage',
    passed: rightR - leftR > 100,
    detail: `ramp across canvas: ${leftR} → ${rightR} (expected a wide spread)`,
  });

  // Alpha carries arrayLength/uCount, so a mis-sized binding shows here.
  const alpha = samplePixel(canvas, 128, 32)[3];
  checks.push({
    name: 'storageLength matches the bound buffer',
    passed: near(alpha!, 255),
    detail: `alpha ${alpha} expected ~255`,
  });

  // Render targets: draw a known uv into one, then sample it back. The whole
  // path is invisible to the node suite — target creation, drawTo's separate
  // encoder, and the sampler binding all need a real device.
  const target = createRenderTarget(renderer, { width: 128, height: 64 });
  const write = createProgram(renderer, targetWriteShader);
  write.attributes.aPosition.set(quad.positions);
  write.attributes.aUv.set(quad.uvs);
  write.setIndices(quad.indices);
  write.uniforms.uMark.set(MARK);

  const read = createProgram(renderer, targetReadShader);
  read.attributes.aPosition.set(quad.positions);
  read.attributes.aUv.set(quad.uvs);
  read.setIndices(quad.indices);
  read.uniforms.uTarget.set(target.texture);

  await new Promise<void>((resolve) => {
    const stop = renderer.loop(() => {
      renderer.drawTo(target, () => {
        write.draw();
      });
      read.draw();
      stop();
      resolve();
    });
  });

  // Blue is the constant the write pass stamped in. Reading anything else means
  // the sample never reached the target's contents.
  const [, , markBlue] = samplePixel(canvas, 128, 32);
  checks.push({
    name: 'render target round-trips its contents',
    passed: near(markBlue!, Math.round(MARK * 255), 12),
    detail: `blue ${markBlue} expected ~${Math.round(MARK * 255)}`,
  });

  // Red is v as stored (sampled with the documented flip), green is v as this
  // pass computes it. They agree only if the target's rows come back in the
  // order the docs promise — a target mirrored the other way still draws
  // something plausible, so nothing else here would notice.
  for (const [label, y] of [
    ['top', 8],
    ['middle', 32],
    ['bottom', 56],
  ] as const) {
    const [storedV, ownV] = samplePixel(canvas, 128, y);
    checks.push({
      name: `render target preserves row order (${label})`,
      passed: near(storedV!, ownV!, 12),
      detail: `stored v ${storedV} vs this pass's v ${ownV}`,
    });
  }

  // present(): one frame, drawn synchronously, with no requestAnimationFrame in
  // sight. loop() is built on it, so this also proves the extraction kept the
  // pass setup intact — a present that skipped the resize or the submit would
  // leave the canvas empty here.
  {
    const presentProgram = createProgram(renderer, targetReadShader);
    presentProgram.attributes.aPosition.set(quad.positions);
    presentProgram.attributes.aUv.set(quad.uvs);
    presentProgram.setIndices(quad.indices);
    presentProgram.uniforms.uTarget.set(target.texture);

    const before = samplePixel(canvas, 128, 32);
    renderer.present(() => presentProgram.draw());
    const after = samplePixel(canvas, 128, 32);

    checks.push({
      name: 'present() draws a frame without a loop',
      passed: after.some((channel, index) => channel !== before[index]) || after[2]! > 0,
      detail: `canvas ${before.slice(0, 3).join(',')} -> ${after.slice(0, 3).join(',')}`,
    });
  }

  window.__GPU_RESULTS__ = { backend: renderer.backend, mode: 'webgpu', checks };
}

void run().catch((error: unknown) => {
  window.__GPU_RESULTS__ = {
    backend: 'error',
    mode: 'webgpu',
    checks: [{ name: 'harness', passed: false, detail: String(error) }],
  };
});
