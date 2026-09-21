'use client';

import { useEffect, useRef } from 'react';
import {
  createPlane,
  createProgram,
  createRenderer,
  loadTexture,
  type BroMetalProgram,
  type CompiledShader,
  type GpuRecord,
} from 'brometal';
import {
  causticsShader,
  checkerShader,
  chromaticShader,
  crtShader,
  edgesShader,
  electricShader,
  fbmShader,
  fireShader,
  glitchShader,
  halftoneShader,
  juliaShader,
  kaleidoscopeShader,
  lightingShader,
  metaballsShader,
  paletteShader,
  raymarchShader,
  ringsShader,
  sdfShader,
  sepiaShader,
  starfieldShader,
  toonShader,
  tunnelShader,
  valueNoiseShader,
  voronoiShader,
  warpShader,
  worleyEdgesShader,
} from 'brometal/shaders';
import type { ExampleEntry } from '@/lib/examples';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import ErrorToast, { useBroMetalError } from '@/components/ErrorToast';

const IMAGE_TEXTURE = 'bricks104';

const SHADERS: Record<string, CompiledShader<GpuRecord, GpuRecord, GpuRecord>> = {
  'value-noise': valueNoiseShader,
  fbm: fbmShader,
  voronoi: voronoiShader,
  palette: paletteShader,
  sdf: sdfShader,
  lighting: lightingShader,
  toon: toonShader,
  checker: checkerShader,
  rings: ringsShader,
  kaleidoscope: kaleidoscopeShader,
  'worley-edges': worleyEdgesShader,
  tunnel: tunnelShader,
  metaballs: metaballsShader,
  starfield: starfieldShader,
  fire: fireShader,
  caustics: causticsShader,
  warp: warpShader,
  electric: electricShader,
  julia: juliaShader,
  raymarch: raymarchShader,
  crt: crtShader,
  chromatic: chromaticShader,
  halftone: halftoneShader,
  edges: edgesShader,
  glitch: glitchShader,
  sepia: sepiaShader,
};

type QuadProgram = BroMetalProgram<
  { aPosition: 'vec3'; aUv: 'vec2' },
  GpuRecord,
  { uTime: 'float'; uAspect: 'float' }
>;

export default function ShaderExampleDemo({ example }: { example: ExampleEntry }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats, tick } = useFrameStats();
  const { error, report, dismiss } = useBroMetalError();

  useEffect(() => {
    const canvas = canvasRef.current;
    const shader = example.shaderKey === undefined ? undefined : SHADERS[example.shaderKey];
    if (canvas === null || shader === undefined) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, {
        onError: report,
        clearColor: [0.025, 0.025, 0.045, 1],
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }

      const quad = createPlane({ width: 2, height: 2 });
      const program = createProgram(renderer, shader) as unknown as QuadProgram;
      program.attributes.aPosition.set(quad.positions);
      program.attributes.aUv.set(quad.uvs);
      program.setIndices(quad.indices);

      const texture = example.needsTexture === true
        ? await loadTexture(renderer, `/textures/${IMAGE_TEXTURE}.jpg`)
        : null;
      if (cancelled) {
        texture?.dispose();
        program.dispose();
        renderer.destroy();
        return;
      }
      if (texture !== null) {
        (program.uniforms as Record<string, { set(value: unknown): void }>).uTex!.set(texture);
      }

      const stop = renderer.loop((time) => {
        tick(time);
        program.uniforms.uTime.set(time);
        program.uniforms.uAspect.set(renderer.aspect);
        program.draw();
      });

      cleanup = () => {
        stop();
        texture?.dispose();
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
        <p className="showcase-kicker">Prebuilt shader</p>
        <h1>{example.name}</h1>
        <p>{example.description}</p>
        <div className="showcase-tags">
          {example.uses?.split(' · ').map((name) => <span key={name}>{name}</span>)}
        </div>
        <small>Import directly from brometal/shaders. No runtime compilation.</small>
      </aside>
      <DemoStats stats={stats}>brometal/shaders · precompiled · one draw call</DemoStats>
      <ErrorToast error={error} onDismiss={dismiss} />
    </>
  );
}
