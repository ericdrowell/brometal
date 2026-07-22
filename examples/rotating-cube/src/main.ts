import { createProgram, createRenderer, mat4 } from 'brometal';
import cubeShader from './shaders/cube.shader.gen';
import { colors, indices, positions } from './geometry';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (canvas === null) {
  throw new Error('missing #scene canvas');
}

const renderer = createRenderer(canvas, { clearColor: [0.07, 0.07, 0.1, 1], cull: 'back' });
const program = createProgram(renderer.gl, cubeShader);

program.attributes.aPosition.set(positions);
program.attributes.aColor.set(colors);
program.setIndices(indices);

// Scratch matrices — the render loop below allocates nothing.
const view = mat4.translation(0, 0, -6);
const projection = mat4.scratch();
const model = mat4.scratch();
const tilt = mat4.scratch();
const mvp = mat4.scratch();

renderer.loop((t) => {
  const { drawingBufferWidth, drawingBufferHeight } = renderer.gl;
  const aspect = drawingBufferWidth / Math.max(drawingBufferHeight, 1);
  mat4.perspective(Math.PI / 4, aspect, 0.1, 100, projection);
  mat4.multiply(mat4.rotationY(t * 0.9, model), mat4.rotationX(t * 0.6, tilt), model);
  mat4.multiply(view, model, mvp);
  mat4.multiply(projection, mvp, mvp);

  program.uniforms.uMvp.set(mvp);
  program.draw();
});
