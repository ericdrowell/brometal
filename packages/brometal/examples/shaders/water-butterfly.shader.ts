import { shader, vec2, vec4, floor, mod, pow, sin, cos, mix, step } from 'brometal';

/**
 * Water Bro — the ocean's technique follows Three.js Water Pro
 * (https://threejsroadmap.com/buy-threejs-water-pro), reimplemented for BroMetal
 * with the author's permission. Water Pro runs its IFFT in compute shaders; this
 * pass predates BroMetal's compute stage and does the transform the pre-compute
 * way, as fragment passes ping-ponging between render targets.
 *
 * This pass builds the butterfly table the FFT stages read: for every
 * (stage, index) pair, the twiddle factor and the two source indices that feed
 * that output. It runs once at startup, not per frame.
 *
 * The table is laid out along U only — width LOG2N*N, height 1 — because rows
 * are the axis where writing and reading disagree: a fullscreen quad's NDC +y
 * covers a target's first row, while texture v addresses that row as v = 0. A
 * layout that splits meaning across rows therefore reads back flipped. U has no
 * such asymmetry.
 *
 * Indices are stored in an RGBA16F target. Integers below 2048 are exact in
 * half float, so a 128-point transform round-trips its indices losslessly.
 */

/**
 * Reverse the low 7 bits of an index (7 = log2 of the 128-point transform). The
 * first butterfly stage reads its operands in bit-reversed order, which is what
 * lets every later stage read contiguously — the classic decimation-in-time
 * reordering, done here with float arithmetic because the DSL has no integer
 * bit operators.
 *
 * Sizes are repeated as local consts in every function below: the DSL resolves
 * only shader parameters and locals, so a module-level constant is out of scope.
 */
function bitReverse(index: number): number {
  const stages = 7;
  let value = index;
  let reversed = 0;
  for (let i = 0; i < stages; i += 1) {
    reversed = reversed * 2 + mod(value, 2);
    value = floor(value / 2);
  }
  return reversed;
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: {},
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment(_uniforms, { vUv }) {
    const size = 128;
    const stages = 7;
    const twoPi = 6.283185307179586;

    const linear = floor(vUv.x * (stages * size));
    const stage = floor(linear / size);
    const index = mod(linear, size);

    // Span doubles every stage: 1, 2, 4 … 64. Entries whose index falls in the
    // lower half of a 2*span block are the "top" wing of their butterfly.
    const span = pow(2, stage);
    const wing = step(mod(index, span * 2), span - 0.5);

    // The twiddle exponent walks k around the unit circle at a rate set by the
    // stage. Positive sign — this is the inverse transform; the forward one
    // would negate the angle.
    const k = mod(index * (size / (span * 2)), size);
    const angle = (twoPi * k) / size;

    const top = mix(index - span, index, wing);
    const bottom = mix(index, index + span, wing);

    // Only stage 0 reorders; every later stage reads the previous stage's
    // already-permuted output in place.
    const isFirst = step(stage, 0.5);
    return vec4(
      cos(angle),
      sin(angle),
      mix(top, bitReverse(top), isFirst),
      mix(bottom, bitReverse(bottom), isFirst),
    );
  },
});
