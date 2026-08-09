import { shader, vec4, floor, min, max, storageWrite } from 'brometal';

/**
 * Fixture: a compute pass writing a known function of the invocation id.
 *
 * The values are deliberately derived from `id.x` so that a wrong dispatch
 * count, a wrong workgroup size, a mis-bound buffer or unflushed uniforms each
 * produce a different, recognisable wrong answer rather than a uniform blank.
 */
export const GpuCompute = shader({
  uniforms: { uCount: 'float' },
  storage: { uOut: 'vec4' },
  workgroupSize: [64, 1, 1],

  compute({ uOut, uCount }, id) {
    const index = min(floor(id.x), max(uCount - 1, 0));
    // r ramps with the index, g is a constant carried through the uniform block,
    // b counts down. Reading zeros — the classic unflushed-uniform symptom —
    // gives (0, 0, 0), which cannot be confused with any correct output.
    storageWrite(uOut, index, vec4(index / uCount, 0.5, 1 - index / uCount, 1));
  },
});
