'use client';

import { useEffect, useRef, useState } from 'react';
import { createProgram, createRenderer, mat4, type RendererBackend } from 'brometal';
import cubesShader from '@/shaders/instanced-cubes.shader.gen';
import { indices, pastelColors, positions } from '@/lib/cube-geometry';
import BackendBadge from '@/components/BackendBadge';

const GRID = 50; // 50 × 50 × 50 = 125,000 cubes
const SPACING = 2.4;
const COUNT = GRID * GRID * GRID;

export default function LotsOfCubesDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
    const renderer = await createRenderer(canvas, { clearColor: [0.05, 0.05, 0.08, 1], cull: 'back' });
    if (cancelled) {
      renderer.destroy();
      return;
    }
      setBackend(renderer.backend);
    const program = createProgram(renderer, cubesShader);
    program.attributes.aPosition.set(positions);
    program.attributes.aColor.set(pastelColors);
    program.setIndices(indices);

    const offsets = new Float32Array(COUNT * 3);
    const axes = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    const scales = new Float32Array(COUNT);
    const tints = new Float32Array(COUNT * 3);

    let index = 0;
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        for (let z = 0; z < GRID; z++) {
          const center = (GRID - 1) / 2;
          offsets[index * 3] = (x - center) * SPACING;
          offsets[index * 3 + 1] = (y - center) * SPACING;
          offsets[index * 3 + 2] = (z - center) * SPACING;

          const ax = Math.random() * 2 - 1;
          const ay = Math.random() * 2 - 1;
          const az = Math.random() * 2 - 1;
          const axisLength = Math.hypot(ax, ay, az) || 1;
          axes[index * 3] = ax / axisLength;
          axes[index * 3 + 1] = ay / axisLength;
          axes[index * 3 + 2] = az / axisLength;

          speeds[index] = 0.5 + Math.random() * 2;
          scales[index] = 0.9 + Math.random() * 0.6;

          tints[index * 3] = 0.45 + (0.55 * x) / (GRID - 1);
          tints[index * 3 + 1] = 0.45 + (0.55 * y) / (GRID - 1);
          tints[index * 3 + 2] = 0.45 + (0.55 * z) / (GRID - 1);

          index++;
        }
      }
    }

    program.instanceAttributes.iOffset.set(offsets);
    program.instanceAttributes.iAxis.set(axes);
    program.instanceAttributes.iSpeed.set(speeds);
    program.instanceAttributes.iScale.set(scales);
    program.instanceAttributes.iTint.set(tints);

    const eye = mat4.translation(0, 0, -250);
    const tilt = mat4.rotationX(0.35);
    const projection = mat4.scratch();
    const orbit = mat4.scratch();
    const viewProj = mat4.scratch();

    const stop = renderer.loop((t) => {
      mat4.perspective(Math.PI / 4, renderer.aspect, 1, 500, projection);
      mat4.multiply(tilt, mat4.rotationY(t * 0.12, orbit), orbit);
      mat4.multiply(eye, orbit, viewProj);
      mat4.multiply(projection, viewProj, viewProj);

      program.uniforms.uViewProj.set(viewProj);
      program.uniforms.uTime.set(t);
      program.draw();
    });

    cleanup = () => {
      stop();
      program.dispose();
      renderer.destroy();
    };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="hud">
        <strong>125,000 cubes · 1 draw call</strong>
        <br />
        rotation computed on the GPU — per-frame upload: one mat4 + one float
      </div>
      <BackendBadge backend={backend} />
    </>
  );
}
