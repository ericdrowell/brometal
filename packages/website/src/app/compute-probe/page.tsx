'use client';

import { useEffect, useRef, useState } from 'react';
import { createPlane, createProgram, createRenderer, createStorageBuffer } from 'brometal';
import computeShader from '@/shaders/probe-compute.shader.gen';
import showShader from '@/shaders/probe-show.shader.gen';

const COUNT = 256;
const WORKGROUP = 64;

/**
 * A GPU smoke test for the compute stage, not a showcase.
 *
 * A compute pass fills a storage buffer with a gradient; a fragment pass reads
 * it back and paints it. If dispatch works, the canvas is a smooth blue-to-red
 * ramp. Black means the buffer was never written, banding means the dispatch
 * count is wrong, and a dark image means arrayLength disagreed with the count.
 */
export default function ComputeProbePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('starting…');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cleanup: (() => void) | null = null;

    void (async () => {
      try {
        const renderer = await createRenderer(canvas, { clearColor: [0, 0, 0, 1] });
        if (renderer.backend !== 'webgpu') {
          setStatus('needs WebGPU — this backend has no compute stage');
          return;
        }

        const buffer = createStorageBuffer(renderer, new Float32Array(COUNT * 4));

        const pass = createProgram(renderer, computeShader);
        pass.uniforms.uCount.set(COUNT);
        pass.uniforms.uOut.set(buffer);
        pass.dispatch(COUNT / WORKGROUP);

        const quad = createPlane({ width: 2, height: 2, widthSegments: 1, heightSegments: 1 });
        const show = createProgram(renderer, showShader);
        show.attributes.aPosition.set(quad.positions);
        show.attributes.aUv.set(quad.uvs);
        show.setIndices(quad.indices);
        show.uniforms.uCount.set(COUNT);
        show.uniforms.uData.set(buffer);

        const stop = renderer.loop(() => show.draw());
        setStatus(`dispatched ${COUNT / WORKGROUP} workgroups of ${WORKGROUP} on ${renderer.backend}`);
        cleanup = () => {
          stop();
          pass.dispose();
          show.dispose();
          buffer.dispose();
          renderer.destroy();
        };
      } catch (error) {
        setStatus(`failed: ${(error as Error).message}`);
      }
    })();

    return () => cleanup?.();
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Compute probe</h1>
          <p className="panel-note">{status}</p>
        </div>
      </div>
    </>
  );
}
