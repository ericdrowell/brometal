'use client';

import { useEffect, useRef } from 'react';
import {
  createCamera,
  createProgram,
  createRenderer,
  createSphere,
  createTorusKnot,
  mat4,
  type Geometry,
} from 'brometal';
import toonShader from '../shaders/toon-showcase.shader.gen';
import DemoStats, { useFrameStats } from './_site/DemoStats';
import ErrorToast, { useBroMetalError } from './_site/ErrorToast';

function setGeometry(
  program: ReturnType<typeof createProgram<typeof toonShader.attributes, typeof toonShader.instanceAttributes, typeof toonShader.uniforms>>,
  geometry: Geometry,
): void {
  program.attributes.aPosition.set(geometry.positions);
  program.attributes.aNormal.set(geometry.normals);
  program.setIndices(geometry.indices);
}

export default function ToonDemo() {
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
        clearColor: [0.018, 0.012, 0.055, 1],
        cull: 'back',
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }

      const knot = createTorusKnot({
        radius: 1.65,
        tube: 0.42,
        tubularSegments: 320,
        radialSegments: 28,
        p: 3,
        q: 7,
      });
      const moon = createSphere({ radius: 1, widthSegments: 72, heightSegments: 36 });
      const knotProgram = createProgram(renderer, toonShader);
      const moonProgram = createProgram(renderer, toonShader);
      setGeometry(knotProgram, knot);
      setGeometry(moonProgram, moon);

      const cameraPos: [number, number, number] = [0, 0.25, 9.4];
      const camera = createCamera({ position: cameraPos });
      camera.lookAt(0, 0, 0);
      const knotModel = mat4.scratch();
      const knotTilt = mat4.scratch();
      const moonModel = mat4.identity();

      const stop = renderer.loop((time) => {
        tick(time);
        const viewProjection = camera.viewProjection(renderer.aspect);
        const light: [number, number, number] = [
          Math.cos(time * 0.38) * 0.65,
          0.8,
          Math.sin(time * 0.38) * 0.45 + 0.3,
        ];

        mat4.rotationY(time * 0.23, knotModel);
        mat4.rotationX(-0.58 + Math.sin(time * 0.27) * 0.08, knotTilt);
        mat4.multiply(knotModel, knotTilt, knotModel);
        knotProgram.uniforms.uViewProj.set(viewProjection);
        knotProgram.uniforms.uModel.set(knotModel);
        knotProgram.uniforms.uOffset.set([0, -0.1, 0]);
        knotProgram.uniforms.uScale.set(1.18);
        knotProgram.uniforms.uLightDir.set(light);
        knotProgram.uniforms.uViewPos.set(cameraPos);
        knotProgram.uniforms.uBaseColor.set([0.16, 0.32, 1]);
        knotProgram.uniforms.uAccentColor.set([1, 0.15, 0.66]);
        knotProgram.uniforms.uBands.set(4);
        knotProgram.uniforms.uTime.set(time);
        knotProgram.draw();

        moonProgram.uniforms.uViewProj.set(viewProjection);
        moonProgram.uniforms.uModel.set(moonModel);
        moonProgram.uniforms.uLightDir.set(light);
        moonProgram.uniforms.uViewPos.set(cameraPos);
        moonProgram.uniforms.uBands.set(3);
        moonProgram.uniforms.uTime.set(time);

        const orbit = time * 0.42;
        const moons: Array<{
          offset: [number, number, number];
          scale: number;
          base: [number, number, number];
          accent: [number, number, number];
        }> = [
          {
            offset: [Math.cos(orbit) * 3.45, 1.25 + Math.sin(orbit * 1.3) * 0.35, Math.sin(orbit) * 1.1 - 0.5],
            scale: 0.58,
            base: [1, 0.28, 0.08],
            accent: [1, 0.88, 0.12],
          },
          {
            offset: [Math.cos(orbit + 2.2) * 3.2, -1.55 + Math.sin(orbit * 0.8) * 0.28, Math.sin(orbit + 2.2) * 1.2],
            scale: 0.42,
            base: [0.05, 0.78, 0.72],
            accent: [0.48, 1, 0.9],
          },
          {
            offset: [Math.cos(orbit + 4.4) * 3.65, 0.05 + Math.sin(orbit * 1.1) * 0.5, Math.sin(orbit + 4.4) * 1.4 - 0.2],
            scale: 0.32,
            base: [0.72, 0.16, 1],
            accent: [1, 0.52, 0.96],
          },
        ];

        for (const body of moons) {
          moonProgram.uniforms.uOffset.set(body.offset);
          moonProgram.uniforms.uScale.set(body.scale);
          moonProgram.uniforms.uBaseColor.set(body.base);
          moonProgram.uniforms.uAccentColor.set(body.accent);
          moonProgram.draw();
        }
      });

      cleanup = () => {
        stop();
        knotProgram.dispose();
        moonProgram.dispose();
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
        <p className="showcase-kicker">Cel-shaded geometry</p>
        <h1>Toon Shading</h1>
        <p>A neon torus knot and orbiting moons rendered with stepped light, graphic highlights, silhouette ink, and shadow hatching.</p>
        <div className="showcase-tags">
          <span>toonShade</span><span>specGGX</span><span>3D geometry</span>
        </div>
        <small>Every contour and light band is evaluated live on the GPU.</small>
      </aside>
      <DemoStats stats={stats}>Cel bands · ink contours · animated key light</DemoStats>
      <ErrorToast error={error} onDismiss={dismiss} />
    </>
  );
}
