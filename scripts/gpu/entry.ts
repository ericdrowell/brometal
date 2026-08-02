// Runs inside a real browser against a real GPU. Bundled by scripts/gpu-test.mjs
// and loaded by playwright-core through the system Chrome.
//
// Every assertion reads pixels back off the canvas, because that is the only way
// to prove the whole path ran: shader text correct, pipeline valid, bindings
// wired, uniforms uploaded, dispatch executed. The unit suite already proves the
// emitted WGSL is right, and none of the four bugs this exists to catch were
// visible there.

import { createProgram, createRenderer, createStorageBuffer, createPlane } from 'brometal';
import computeShader from './fixtures/gpu-compute.shader.gen';
import readbackShader from './fixtures/gpu-readback.shader.gen';

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

declare global {
  interface Window {
    __GPU_RESULTS__?: { backend: string; checks: Check[] };
  }
}

const COUNT = 256;
const WORKGROUP = 64;
const WIDTH = 256;
const HEIGHT = 64;

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

async function run(): Promise<void> {
  const checks: Check[] = [];
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const renderer = await createRenderer(canvas, { clearColor: [0, 0, 0, 1] });

  if (renderer.backend !== 'webgpu') {
    window.__GPU_RESULTS__ = {
      backend: renderer.backend,
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

  window.__GPU_RESULTS__ = { backend: renderer.backend, checks };
}

void run().catch((error: unknown) => {
  window.__GPU_RESULTS__ = {
    backend: 'error',
    checks: [{ name: 'harness', passed: false, detail: String(error) }],
  };
});
