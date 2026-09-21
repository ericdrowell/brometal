'use client';

import { useEffect, useRef } from 'react';
import { createProgram, createRenderer, mat4 } from 'brometal';
import haloShader from '@/shaders/instanced-cubes.shader.gen';
import { indices, normals, positions } from '@/lib/cube-geometry';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import ErrorToast, { useBroMetalError } from '@/components/ErrorToast';

const RINGS = 600;
const SLICES = 200;
const COUNT = RINGS * SLICES;
const TAU = Math.PI * 2;

function hash(value: number): number {
  return Math.abs(Math.sin(value * 127.1) * 43758.5453) % 1;
}

function spectralTint(u: number, v: number, spark: number): [number, number, number] {
  const band = Math.sin(u * 3 - v * 2) * 0.5 + 0.5;
  const ember = Math.pow(Math.max(0, Math.sin(u * 5 + v * 3)), 12) * spark;
  return [
    0.18 + band * 0.58 + ember * 0.8,
    0.2 + (1 - band) * 0.5 + ember * 0.35,
    0.62 + (1 - band) * 0.42,
  ];
}

export default function LotsOfCubesDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats, tick } = useFrameStats();
  const { error, report, dismiss } = useBroMetalError();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, {
        onError: report,
        clearColor: [0.002, 0.003, 0.012, 1],
        cull: 'back',
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }

      const program = createProgram(renderer, haloShader);
      program.attributes.aPosition.set(positions);
      program.attributes.aNormal.set(normals);
      program.setIndices(indices);

      const offsets = new Float32Array(COUNT * 3);
      const surfaceNormals = new Float32Array(COUNT * 3);
      const tangents = new Float32Array(COUNT * 3);
      const phases = new Float32Array(COUNT);
      const scales = new Float32Array(COUNT * 3);
      const tints = new Float32Array(COUNT * 3);

      let instance = 0;
      for (let ring = 0; ring < RINGS; ring++) {
        for (let slice = 0; slice < SLICES; slice++) {
          const jitter = hash(instance + 1.7);
          const u = ((ring + slice * 0.381 + jitter * 0.35) / RINGS) * TAU;
          const v = ((slice + jitter * 0.5) / SLICES) * TAU;
          const cu = Math.cos(u);
          const su = Math.sin(u);
          const cv = Math.cos(v);
          const sv = Math.sin(v);
          const major = 34;
          const tube = 10.5 + Math.sin(u * 3 + v * 2) * 1.8;
          const radius = major + tube * cv;
          const base = instance * 3;

          offsets[base] = radius * cu;
          offsets[base + 1] = tube * sv;
          offsets[base + 2] = radius * su;
          surfaceNormals[base] = cu * cv;
          surfaceNormals[base + 1] = sv;
          surfaceNormals[base + 2] = su * cv;
          tangents[base] = -su;
          tangents[base + 1] = 0;
          tangents[base + 2] = cu;

          phases[instance] = (ring / RINGS + slice / SLICES * 0.21 + jitter * 0.025) % 1;
          const fleck = Math.pow(hash(instance + 91.3), 9);
          scales[base] = 0.12 + jitter * 0.1;
          scales[base + 1] = 0.22 + fleck * 1.35;
          scales[base + 2] = 0.12 + hash(instance + 47.9) * 0.09;

          const tint = spectralTint(u, v, fleck);
          tints[base] = tint[0];
          tints[base + 1] = tint[1];
          tints[base + 2] = tint[2];
          instance++;
        }
      }

      program.instanceAttributes.iOffset.set(offsets);
      program.instanceAttributes.iNormal.set(surfaceNormals);
      program.instanceAttributes.iTangent.set(tangents);
      program.instanceAttributes.iPhase.set(phases);
      program.instanceAttributes.iScale.set(scales);
      program.instanceAttributes.iTint.set(tints);

      const projection = mat4.scratch();
      const view = mat4.scratch();
      const viewProj = mat4.scratch();

      const stop = renderer.loop((time) => {
        tick(time);
        const orbit = time * 0.065;
        // Portrait viewers need more distance because perspective FOV is
        // vertical; on a wide screen the same sculpture can sit much closer.
        const distance = 105 + Math.max(0, 1.1 - renderer.aspect) * 90;
        const eye: [number, number, number] = [
          Math.sin(orbit) * distance,
          distance * 0.34 + Math.sin(time * 0.11) * 5,
          Math.cos(orbit) * distance,
        ];
        mat4.perspective(Math.PI / 3.15, renderer.aspect, 0.5, 220, projection);
        mat4.lookAt(eye, [0, 0, 0], [0, 1, 0], view);
        mat4.multiply(projection, view, viewProj);
        program.uniforms.uViewProj.set(viewProj);
        program.uniforms.uViewPos.set(eye);
        program.uniforms.uTime.set(time);
        program.draw();
      });

      cleanup = () => {
        stop();
        program.dispose();
        renderer.destroy();
      };
    })().catch(report);

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [report, tick]);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <aside className="showcase-caption panel">
        <p className="showcase-kicker">Instanced geometry</p>
        <h1>Quantum Halo</h1>
        <p>A kinetic sculpture assembled from 120,000 independently lit cuboids.</p>
        <div className="showcase-tags">
          <span>120k instances</span><span>one draw call</span><span>GPU motion</span>
        </div>
        <small>Every transform and lighting calculation runs on the GPU.</small>
      </aside>
      <DemoStats stats={stats}>120,000 cuboids · 1 draw call · GPU animation</DemoStats>
      <ErrorToast error={error} onDismiss={dismiss} />
    </>
  );
}
