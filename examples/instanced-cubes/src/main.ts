import { createProgram, createRenderer, mat4 } from 'brometal';
import cubesShader from './shaders/cubes.shader.gen';
import { colors, indices, positions } from './geometry';

const GRID = 10; // 10 × 10 × 10 = 1,000 cubes
const SPACING = 2.6;
const COUNT = GRID * GRID * GRID;

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (canvas === null) {
  throw new Error('missing #scene canvas');
}

const renderer = createRenderer(canvas, { clearColor: [0.05, 0.05, 0.08, 1] });
const program = createProgram(renderer.gl, cubesShader);

program.attributes.aPosition.set(positions);
program.attributes.aColor.set(colors);
program.setIndices(indices);

// Per-instance data is generated once and uploaded once — after this block,
// the CPU never touches per-cube state again.
const offsets = new Float32Array(COUNT * 3);
const axes = new Float32Array(COUNT * 3);
const speeds = new Float32Array(COUNT);
const scales = new Float32Array(COUNT);
const tints = new Float32Array(COUNT * 3);

let index = 0;
for (let x = 0; x < GRID; x++) {
  for (let y = 0; y < GRID; y++) {
    for (let z = 0; z < GRID; z++) {
      const center = (GRID - 1) / 2;
      offsets[index * 3] = (x - center) * SPACING;
      offsets[index * 3 + 1] = (y - center) * SPACING;
      offsets[index * 3 + 2] = (z - center) * SPACING;

      const ax = Math.random() * 2 - 1;
      const ay = Math.random() * 2 - 1;
      const az = Math.random() * 2 - 1;
      const length = Math.hypot(ax, ay, az) || 1;
      axes[index * 3] = ax / length;
      axes[index * 3 + 1] = ay / length;
      axes[index * 3 + 2] = az / length;

      speeds[index] = 0.5 + Math.random() * 2;
      scales[index] = 0.3 + Math.random() * 0.2;

      tints[index * 3] = 0.45 + (0.55 * x) / (GRID - 1);
      tints[index * 3 + 1] = 0.45 + (0.55 * y) / (GRID - 1);
      tints[index * 3 + 2] = 0.45 + (0.55 * z) / (GRID - 1);

      index++;
    }
  }
}

program.instanceAttributes.iOffset.set(offsets);
program.instanceAttributes.iAxis.set(axes);
program.instanceAttributes.iSpeed.set(speeds);
program.instanceAttributes.iScale.set(scales);
program.instanceAttributes.iTint.set(tints);

renderer.loop((t) => {
  const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  const projection = mat4.perspective(Math.PI / 4, aspect, 0.1, 200);
  const view = mat4.multiply(
    mat4.translation(0, 0, -46),
    mat4.multiply(mat4.rotationX(0.35), mat4.rotationY(t * 0.12)),
  );

  program.uniforms.uViewProj.set(mat4.multiply(projection, view));
  program.uniforms.uTime.set(t);
  program.draw();
});
