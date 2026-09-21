'use client';

import { useEffect, useRef } from 'react';
import { createPlane, createProgram, createRenderer } from 'brometal';
import showcaseShader from '@/shaders/showcase.shader.gen';
import type { ExampleEntry } from '@/lib/examples';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import ErrorToast, { useBroMetalError } from '@/components/ErrorToast';

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export default function ShowcaseDemo({ example }: { example: ExampleEntry }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats, tick } = useFrameStats();
  const { error, report, dismiss } = useBroMetalError();

  useEffect(() => {
    const canvas = canvasRef.current;
    const preset = example.preset;
    const palette = example.palette;
    if (canvas === null || preset === undefined || palette === undefined) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, {
        onError: report,
        clearColor: [0.005, 0.005, 0.012, 1],
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }

      const program = createProgram(renderer, showcaseShader);
      const quad = createPlane({ width: 2, height: 2 });
      program.attributes.aPosition.set(quad.positions);
      program.attributes.aUv.set(quad.uvs);
      program.setIndices(quad.indices);
      program.uniforms.uScene.set(preset);
      program.uniforms.uSeed.set(preset * 7.31 + 3.7);
      program.uniforms.uPrimary.set(rgb(palette[1]));
      program.uniforms.uAccent.set(rgb(palette[2]));
      // These art studies animate over time, but stay spatially anchored so
      // simply moving through the gallery never makes the scene lurch around.
      program.uniforms.uPointer.set([0.5, 0.5]);

      const stop = renderer.loop((time) => {
        tick(time);
        program.uniforms.uTime.set(time);
        program.uniforms.uAspect.set(renderer.aspect);
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
  }, [example, report, tick]);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <aside className="showcase-caption panel">
        <p className="showcase-kicker">
          GPU technique {String((example.preset ?? 0) + 1).padStart(2, '0')} / 10
        </p>
        <h1>{example.name}</h1>
        <p>{example.description}</p>
        <div className="showcase-tags">
          {example.tags?.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <small>Procedurally animated in real time.</small>
      </aside>
      <DemoStats stats={stats}>One quad · one TypeScript shader · live WebGPU</DemoStats>
      <ErrorToast error={error} onDismiss={dismiss} />
    </>
  );
}
