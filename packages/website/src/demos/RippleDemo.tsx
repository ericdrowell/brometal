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
import rippleShader from '@/shaders/ripple.shader.gen';

interface RippleParams {
  speed: number;
  spacing: number;
  height: number;
}

const DEFAULTS: RippleParams = { speed: 0.7, spacing: 3.2, height: 0.55 };

export default function RippleDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const paramsRef = useRef<RippleParams>({ ...DEFAULTS });
  const [params, setParams] = useState<RippleParams>({ ...DEFAULTS });

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

      const program = createProgram(renderer, rippleShader);
      const plane = createPlane({ width: 4, height: 4, widthSegments: 256, heightSegments: 256 });
      program.attributes.aPosition.set(plane.positions);
      program.attributes.aUv.set(plane.uvs);
      program.setIndices(plane.indices);
      program.uniforms.uLightDir.set([0.45, 0.75, 0.5]);
      const cameraPos: [number, number, number] = [0, 3.4, 4.2];

      const model = mat4.multiply(mat4.translation(0, -0.7, -0.2), mat4.rotationX(-Math.PI / 2));
      const camera = createCamera({ position: cameraPos });
      camera.lookAt(0, -0.7, -0.2);

      // Phase accumulates by speed each frame, so scrubbing the speed slider
      // changes tempo without teleporting the rings.
      let phase = 0;
      let lastT = 0;

      const stop = renderer.loop((t) => {
        const dt = Math.min(t - lastT, 0.05);
        lastT = t;
        phase += dt * paramsRef.current.speed;

        program.uniforms.uViewProj.set(camera.viewProjection(renderer.aspect));
        program.uniforms.uModel.set(model);
        program.uniforms.uPhase.set(phase);
        program.uniforms.uSpacing.set(paramsRef.current.spacing);
        program.uniforms.uAmp.set(paramsRef.current.height);
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

  const onParam = (key: keyof RippleParams, value: number): void => {
    paramsRef.current[key] = value;
    setParams({ ...paramsRef.current });
  };

  const slider = (
    key: keyof RippleParams,
    label: string,
    min: number,
    max: number,
    step: number,
  ) => (
    <div className="row">
      <label htmlFor={`ripple-${key}`}>{label}</label>
      <input
        id={`ripple-${key}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={params[key]}
        onChange={(event) => onParam(key, Number(event.target.value))}
      />
      <output htmlFor={`ripple-${key}`}>{params[key].toFixed(2)}</output>
    </div>
  );

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Ripples</h1>
          <p className="panel-note">
            Every vertex&apos;s height is <code>easeInOutCubic</code> of the wave phase, shaded by
            height and slope — 65k eased animations, three floats per frame.
          </p>
          {slider('speed', 'Speed', 0.1, 2, 0.05)}
          {slider('spacing', 'Spacing', 1, 8, 0.1)}
          {slider('height', 'Amplitude', 0, 1.2, 0.05)}
        </div>
      </div>
      <BackendBadge backend={backend} />
    </>
  );
}
