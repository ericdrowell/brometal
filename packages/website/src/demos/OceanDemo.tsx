'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createPlane,
  createProgram,
  createRenderer,
  mat4,
  type RendererBackend,
} from 'brometal';
import BackendBadge from '@/components/BackendBadge';
import oceanShader from '@/shaders/ocean.shader.gen';

export default function OceanDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      // Sky matches the fragment's sky color so the ocean edge melts into it.
      const renderer = await createRenderer(canvas, { clearColor: [0.09, 0.11, 0.2, 1] });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const program = createProgram(renderer, oceanShader);
      const plane = createPlane({ width: 40, height: 40, widthSegments: 220, heightSegments: 220 });
      program.attributes.aPosition.set(plane.positions);
      program.attributes.aUv.set(plane.uvs);
      program.setIndices(plane.indices);

      // Moon low over the horizon ahead — long specular streak toward camera.
      const sun = [0.15, 0.28, -0.95] as const;
      const len = Math.hypot(...sun);
      program.uniforms.uSunDir.set([sun[0] / len, sun[1] / len, sun[2] / len]);

      const model = mat4.multiply(mat4.translation(0, -1.1, -6), mat4.rotationX(-Math.PI / 2));
      const cameraPos: [number, number, number] = [0, 1.4, 7.5];
      program.uniforms.uViewPos.set(cameraPos);
      const camera = createCamera({ position: cameraPos, far: 120 });
      camera.lookAt(0, 0.1, -12);

      const stop = renderer.loop((t) => {
        program.uniforms.uViewProj.set(camera.viewProjection(renderer.aspect));
        program.uniforms.uModel.set(model);
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
      <div className="panels">
        <div className="panel">
          <h1>Ocean</h1>
          <p className="panel-note">
            Four Gerstner waves move ~48k vertices in the vertex shader; the fragment adds fbm
            micro-ripples, fresnel sky reflection, and a moonlight glint. All motion is GPU-side —
            the CPU uploads one float per frame.
          </p>
        </div>
      </div>
      <BackendBadge backend={backend} />
    </>
  );
}
