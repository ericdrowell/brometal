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
import terrainShader from '@/shaders/terrain.shader.gen';

export default function TerrainDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const ampRef = useRef(0.9);
  const [amp, setAmp] = useState(0.9);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, { clearColor: [0.06, 0.06, 0.1, 1] });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const program = createProgram(renderer, terrainShader);
      // A densely-tessellated plane: ~65k vertices for the vertex shader to move.
      const plane = createPlane({ width: 9, height: 9, widthSegments: 256, heightSegments: 256 });
      program.attributes.aPosition.set(plane.positions);
      program.attributes.aUv.set(plane.uvs);
      program.setIndices(plane.indices);
      program.uniforms.uLightDir.set([0.45, 0.85, 0.3]);

      // Lay the XY plane flat (rotate -90° about X), slightly below the camera.
      const model = mat4.multiply(mat4.translation(0, -0.9, -1), mat4.rotationX(-Math.PI / 2));

      const camera = createCamera({ position: [0, 1.7, 4.4] });
      camera.lookAt(0, -0.4, -2);

      const stop = renderer.loop((t) => {
        program.uniforms.uViewProj.set(camera.viewProjection(renderer.aspect));
        program.uniforms.uModel.set(model);
        program.uniforms.uTime.set(t);
        program.uniforms.uAmp.set(ampRef.current);
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

  const onAmp = (value: number): void => {
    ampRef.current = value;
    setAmp(value);
  };

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Terrain</h1>
          <p className="panel-note">
            A flat 256×256 plane, displaced by <code>fbm2</code> noise <em>in the vertex shader</em> —
            heights and normals computed per vertex, lit per pixel on the GPU.
          </p>
          <div className="row">
            <label htmlFor="amp">Amplitude</label>
            <input
              id="amp"
              type="range"
              min={0}
              max={1.8}
              step={0.05}
              value={amp}
              onChange={(event) => onAmp(Number(event.target.value))}
            />
            <output htmlFor="amp">{amp.toFixed(2)}</output>
          </div>
        </div>
      </div>
      <BackendBadge backend={backend} />
    </>
  );
}
