'use client';

import { useEffect, useRef, useState } from 'react';
import { createCamera, createProgram, createRenderer, mat4 } from 'brometal';
import lightShader from '@/shaders/light-cube.shader.gen';
import { colors, indices, normals, positions } from '@/lib/cube-geometry';

export default function LightDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightRef = useRef(new Float32Array([4, 3, 6]));
  const [light, setLight] = useState<[number, number, number]>([4, 3, 6]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const renderer = createRenderer(canvas, { clearColor: [0.07, 0.07, 0.1, 1], cull: 'back' });
    const program = createProgram(renderer.gl, lightShader);
    program.attributes.aPosition.set(positions);
    program.attributes.aNormal.set(normals);
    program.attributes.aColor.set(colors);
    program.setIndices(indices);

    const cameraPos: [number, number, number] = [0, 0, 6];
    const camera = createCamera({ position: cameraPos });
    program.uniforms.uViewPos.set(cameraPos);

    const model = mat4.scratch();
    const tilt = mat4.scratch();

    const stop = renderer.loop((t) => {
      const { drawingBufferWidth, drawingBufferHeight } = renderer.gl;
      const aspect = drawingBufferWidth / Math.max(drawingBufferHeight, 1);
      mat4.multiply(mat4.rotationY(t * 0.5, model), mat4.rotationX(t * 0.3, tilt), model);

      program.uniforms.uViewProj.set(camera.viewProjection(aspect));
      program.uniforms.uModel.set(model);
      program.uniforms.uLightPos.set(lightRef.current);
      program.draw();
    });

    return () => {
      stop();
      program.dispose();
      renderer.destroy();
    };
  }, []);

  const onLightChange = (index: number, value: number): void => {
    const next: [number, number, number] = [...light];
    next[index] = value;
    setLight(next);
    lightRef.current[index] = value;
  };

  const axes = ['X', 'Y', 'Z'] as const;

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Light</h1>
          <h2>Position</h2>
          {axes.map((axis, index) => (
            <div className="row" key={axis}>
              <label htmlFor={`light-${axis}`}>{axis}</label>
              <input
                id={`light-${axis}`}
                type="range"
                min={-10}
                max={10}
                step={0.1}
                value={light[index]}
                onChange={(event) => onLightChange(index, Number(event.target.value))}
              />
              <output htmlFor={`light-${axis}`}>{light[index]!.toFixed(1)}</output>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
