'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createPlane,
  createProgram,
  createRenderer,
  createRenderTarget,
  createSphere,
  mat4,
  type RendererBackend,
} from 'brometal';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import surfaceShader from '@/shaders/water-surface.shader.gen';
import skyShader from '@/shaders/water-sky.shader.gen';
import skydomeShader from '@/shaders/water-skydome.shader.gen';

export default function DayOceanDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const horizon: [number, number, number] = [0.62, 0.74, 0.86];
      const renderer = await createRenderer(canvas, {
        clearColor: [horizon[0], horizon[1], horizon[2], 1],
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      // The sky is raymarched into an equirectangular map by a fullscreen quad.
      const quad = createPlane({ width: 2, height: 2, widthSegments: 1, heightSegments: 1 });
      const sky = createProgram(renderer, skyShader);
      sky.attributes.aPosition.set(quad.positions);
      sky.attributes.aUv.set(quad.uvs);
      sky.setIndices(quad.indices);
      // Deliberately small: clouds are raymarched per texel, and the water only
      // ever reads this through a rough reflection.
      const skyTarget = createRenderTarget(renderer, { width: 512, height: 256 });

      // The ocean grid is built in XZ so the shader's world-space maths lines up
      // with it directly. createPlane lays a grid out in XY, so the horizontal
      // axes are swapped into place here rather than rotated by a model matrix,
      // which would leave the displacement pointing sideways.
      const grid = createPlane({
        width: 700,
        height: 700,
        widthSegments: 600,
        heightSegments: 600,
      });
      const positions = new Float32Array(grid.positions.length);
      for (let i = 0; i < grid.positions.length; i += 3) {
        positions[i] = grid.positions[i];
        positions[i + 1] = 0;
        positions[i + 2] = grid.positions[i + 1];
      }

      const surface = createProgram(renderer, surfaceShader);
      surface.attributes.aPosition.set(positions);
      surface.setIndices(grid.indices);

      const sun: [number, number, number] = [0.35, 0.22, -0.91];
      const sunLength = Math.hypot(...sun);
      const sunDir: [number, number, number] = [
        sun[0] / sunLength,
        sun[1] / sunLength,
        sun[2] / sunLength,
      ];

      surface.uniforms.uSunDir.set(sunDir);
      // Wave steepness. Past about 1.4 Gerstner waves self-intersect and crests
      // turn inside out, which reads as a shimmering crease rather than a wave.
      surface.uniforms.uChoppy.set(0.82);
      surface.uniforms.uSkyHorizon.set(horizon);
      // What the water fades to once the bottom is out of reach.
      surface.uniforms.uShallow.set([0.02, 0.17, 0.26]);
      surface.uniforms.uSeabedY.set(-5.5);
      surface.uniforms.uSandColor.set([0.7, 0.65, 0.5]);
      // Red is absorbed roughly an order of magnitude faster than blue-green;
      // that ratio is what turns lit sand into turquoise with depth.
      surface.uniforms.uExtinction.set([0.36, 0.072, 0.05]);
      surface.uniforms.uCausticStrength.set(0.6);
      surface.uniforms.uFoamColor.set([0.92, 0.96, 0.98]);
      surface.uniforms.uNormalStrength.set(0.85);
      surface.uniforms.uFoamAmount.set(0.6);
      surface.uniforms.uModel.set(mat4.identity());
      surface.uniforms.uOrigin.set([0, 0]);
      surface.uniforms.uFlipV.set(renderer.backend === 'webgpu' ? 1 : 0);

      // The dome carries the sky map: drawn around the camera each frame, large
      // enough to sit behind the ocean but inside the far plane.
      const dome = createSphere({ radius: 2200, widthSegments: 48, heightSegments: 24 });
      const skydome = createProgram(renderer, skydomeShader);
      skydome.attributes.aPosition.set(dome.positions);
      skydome.setIndices(dome.indices);

      // One pair of colours drives both the backdrop dome and the map the water
      // reflects, so they cannot disagree.
      const zenith: [number, number, number] = [0.24, 0.46, 0.78];
      sky.uniforms.uZenith.set(zenith);
      sky.uniforms.uHorizon.set(horizon);
      skydome.uniforms.uZenith.set(zenith);
      skydome.uniforms.uHorizon.set(horizon);
      // Turbidity ~2 is a clear maritime day; exposure maps Preetham's absolute
      // luminance into display range.

      const EYE: [number, number, number] = [0, 9.5, 34];
      const camera = createCamera({ position: EYE, far: 3000 });
      camera.lookAt(0, 2.2, -140);

      const stop = renderer.loop((t) => {
        tick(t);

        // Sky first, into its map — the dome and the water's reflection both
        // read it, so the two cannot drift apart.
        renderer.drawTo(skyTarget, () => sky.draw());

        skydome.uniforms.uViewProj.set(camera.viewProjection(renderer.aspect));
        skydome.uniforms.uModel.set(mat4.translation(EYE[0], EYE[1], EYE[2]));
        skydome.draw();

        // Fixed camera, low over the water. Nothing about the view animates —
        // only the sea does.
        surface.uniforms.uSky.set(skyTarget.texture);
        surface.uniforms.uTime.set(t);
        surface.uniforms.uViewPos.set(EYE);
        surface.uniforms.uViewProj.set(camera.viewProjection(renderer.aspect));
        surface.draw();
      });

      cleanup = () => {
        stop();
        surface.dispose();
        sky.dispose();
        skydome.dispose();
        skyTarget.dispose();
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
      <div className="panels">
        <div className="panel">
          <h1>Day Ocean</h1>
          <p className="panel-note">
            Shallow tropical water. Eight Gerstner waves displace the surface in the vertex shader
            and give it an exact normal — the surface is a closed-form function of position, so
            the normal comes from two real tangents rather than from differencing a height map.
            The fragment refracts the view down to a lit seabed and attenuates what returns per
            colour channel: red is absorbed roughly ten times faster than blue-green, and that
            ratio alone is where the turquoise comes from. Foam keys off steepness rather than
            height, so it breaks on tilted faces instead of capping every crest. A slow noise
            scales the whole wave sum, giving patches of calmer and rougher water — without it
            eight waves still read as one uniform field. Every shader was compiled at build time,
            so the page starts immediately.
          </p>
        </div>
      </div>
      <DemoStats stats={stats}>Gerstner ocean with a refracted, lit seabed</DemoStats>
      <BackendBadge backend={backend} />
    </>
  );
}
