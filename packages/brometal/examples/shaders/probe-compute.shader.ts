import { shader, vec4, storageWrite } from 'brometal';

/**
 * The smallest useful compute shader: write a known gradient into a storage
 * buffer, one element per invocation.
 *
 * This exists to prove the compute path end-to-end on a real GPU before
 * anything is built on top of it. The values are deliberately a function of the
 * invocation id, so a wrong dispatch count, a wrong workgroup size, or a
 * mis-bound buffer all show up as a visibly wrong image rather than as nothing.
 */
export default shader({
  uniforms: { uCount: 'float' },
  storage: { uOut: 'vec4' },
  workgroupSize: [64, 1, 1],

  compute({ uOut, uCount }, id) {
    const t = id.x / uCount;
    storageWrite(uOut, id.x, vec4(t, 0.45, 1 - t, 1));
  },
});
