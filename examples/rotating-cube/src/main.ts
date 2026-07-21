import { createProgram, createRenderer, mat4 } from 'brometal';
import cubeShader from './shaders/cube.shader.gen';
import { colors, indices, positions } from './geometry';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (canvas === null) {
  throw new Error('missing #scene canvas');
}

const renderer = createRenderer(canvas, { clearColor: [0.07, 0.07, 0.1, 1] });
const program = createProgram(renderer.gl, cubeShader);

program.attributes.aPosition.set(positions);
program.attributes.aColor.set(colors);
program.setIndices(indices);

renderer.loop((t) => {
  const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  const projection = mat4.perspective(Math.PI / 4, aspect, 0.1, 100);
  const view = mat4.translation(0, 0, -6);
  const model = mat4.multiply(mat4.rotationY(t * 0.9), mat4.rotationX(t * 0.6));
  const mvp = mat4.multiply(projection, mat4.multiply(view, model));

  program.uniforms.uMvp.set(mvp);
  program.draw();
});
