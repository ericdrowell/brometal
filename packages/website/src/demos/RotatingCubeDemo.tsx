'use client';

import { useEffect, useRef } from 'react';
import { createProgram, createRenderer, mat4 } from 'brometal';
import cubeShader from '@/shaders/color-cube.shader.gen';
import { colors, indices, positions } from '@/lib/cube-geometry';

export default function RotatingCubeDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const renderer = createRenderer(canvas, { clearColor: [0.07, 0.07, 0.1, 1], cull: 'back' });
    const program = createProgram(renderer.gl, cubeShader);
    program.attributes.aPosition.set(positions);
    program.attributes.aColor.set(colors);
    program.setIndices(indices);

    const view = mat4.translation(0, 0, -6);
    const projection = mat4.scratch();
    const model = mat4.scratch();
    const tilt = mat4.scratch();
    const mvp = mat4.scratch();

    const stop = renderer.loop((t) => {
      const { drawingBufferWidth, drawingBufferHeight } = renderer.gl;
      const aspect = drawingBufferWidth / Math.max(drawingBufferHeight, 1);
      mat4.perspective(Math.PI / 4, aspect, 0.1, 100, projection);
      mat4.multiply(mat4.rotationY(t * 0.9, model), mat4.rotationX(t * 0.6, tilt), model);
      mat4.multiply(view, model, mvp);
      mat4.multiply(projection, mvp, mvp);
      program.uniforms.uMvp.set(mvp);
      program.draw();
    });

    return () => {
      stop();
      program.dispose();
      renderer.destroy();
    };
  }, []);

  return <canvas ref={canvasRef} className="demo-canvas" />;
}
