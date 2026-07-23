'use client';

import { useEffect, useRef } from 'react';
import { createPlane, createProgram, createRenderer } from 'brometal';
import customShader from '@/shaders/custom.shader.gen';

const FRAGMENT_SOURCE = `function palette(t: number): Vec3 {
  return vec3(
    0.5 + 0.5 * cos(6.28318 * (t + 0.0)),
    0.5 + 0.5 * cos(6.28318 * (t + 0.33)),
    0.5 + 0.5 * cos(6.28318 * (t + 0.67)),
  );
}

fragment({ uTime }, { vUv }) {
  const x = vUv.x * 6 - 3;
  const y = vUv.y * 6 - 3;
  let value = 0;
  let frequency = 1;
  let amplitude = 0.6;
  for (let i = 0; i < 5; i += 1) {
    value = value + amplitude
      * sin(x * frequency + uTime + i * 1.7)
      * cos(y * frequency - uTime * 0.6 + i * 0.9);
    frequency *= 1.9;
    amplitude *= 0.65;
  }
  return vec4(palette(value * 0.5 + 0.15), 1);
}`;

export default function CustomShaderDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const renderer = createRenderer(canvas, { clearColor: [0.07, 0.07, 0.1, 1] });
    const program = createProgram(renderer.gl, customShader);

    // A clip-space quad: the vertex stage outputs positions directly, so the
    // plane's -1..1 extent fills the viewport with no camera at all.
    const quad = createPlane({ width: 2, height: 2 });
    program.attributes.aPosition.set(quad.positions);
    program.attributes.aUv.set(quad.uvs);
    program.setIndices(quad.indices);

    const stop = renderer.loop((t) => {
      program.uniforms.uTime.set(t);
      program.draw();
    });

    return () => {
      stop();
      program.dispose();
      renderer.destroy();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="code-panel panel">
        <h1>Custom Shader</h1>
        <p className="code-note">
          Plain TypeScript — a helper function, <code>let</code> accumulators, and a{' '}
          <code>for</code> loop — compiled to GLSL at build time. No engine, no materials: this
          page is one quad and your code.
        </p>
        <pre>{FRAGMENT_SOURCE}</pre>
      </div>
    </>
  );
}
