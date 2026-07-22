'use client';

import { useEffect, useRef, useState } from 'react';
import { createCamera, createProgram, createRenderer, mat4, type Camera } from 'brometal';
import cubeShader from '@/shaders/camera-cube.shader.gen';
import { colors, indices, positions } from '@/lib/cube-geometry';

interface CameraState {
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

const DEFAULTS: CameraState = { posX: 0, posY: 0, posZ: 6, rotX: 0, rotY: 0, rotZ: 0 };

const TO_RADIANS = Math.PI / 180;

export default function CameraDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [state, setState] = useState<CameraState>(DEFAULTS);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const renderer = createRenderer(canvas, { clearColor: [0.07, 0.07, 0.1, 1], cull: 'back' });
    const program = createProgram(renderer.gl, cubeShader);
    program.attributes.aPosition.set(positions);
    program.attributes.aColor.set(colors);
    program.setIndices(indices);

    const camera = createCamera({ position: [DEFAULTS.posX, DEFAULTS.posY, DEFAULTS.posZ] });
    cameraRef.current = camera;

    const model = mat4.scratch();
    const tilt = mat4.scratch();

    const stop = renderer.loop((t) => {
      const { drawingBufferWidth, drawingBufferHeight } = renderer.gl;
      const aspect = drawingBufferWidth / Math.max(drawingBufferHeight, 1);
      mat4.multiply(mat4.rotationY(t * 0.9, model), mat4.rotationX(t * 0.6, tilt), model);

      program.uniforms.uViewProj.set(camera.viewProjection(aspect));
      program.uniforms.uModel.set(model);
      program.draw();
    });

    return () => {
      stop();
      program.dispose();
      renderer.destroy();
      cameraRef.current = null;
    };
  }, []);

  const apply = (next: CameraState): void => {
    setState(next);
    const camera = cameraRef.current;
    if (camera === null) return;
    camera.setPosition(next.posX, next.posY, next.posZ);
    camera.setRotation(next.rotX * TO_RADIANS, next.rotY * TO_RADIANS, next.rotZ * TO_RADIANS);
  };

  const slider = (
    key: keyof CameraState,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
  ) => (
    <div className="row">
      <label htmlFor={key}>{label}</label>
      <input
        id={key}
        type="range"
        min={min}
        max={max}
        step={step}
        value={state[key]}
        onChange={(event) => apply({ ...state, [key]: Number(event.target.value) })}
      />
      <output htmlFor={key}>{format(state[key])}</output>
    </div>
  );

  const position = (value: number) => value.toFixed(1);
  const degrees = (value: number) => `${value}°`;

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Camera</h1>
          <h2>Position</h2>
          {slider('posX', 'X', -10, 10, 0.1, position)}
          {slider('posY', 'Y', -10, 10, 0.1, position)}
          {slider('posZ', 'Z', -20, 20, 0.1, position)}
          <h2>Rotation</h2>
          {slider('rotX', 'X', -180, 180, 1, degrees)}
          {slider('rotY', 'Y', -180, 180, 1, degrees)}
          {slider('rotZ', 'Z', -180, 180, 1, degrees)}
          <button type="button" className="reset" onClick={() => apply(DEFAULTS)}>
            Reset camera
          </button>
        </div>
      </div>
    </>
  );
}
