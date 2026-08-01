import {
  shader, vec2, vec4, floor, mod, pow, sin, cos, mix, step, max, min,
  storageRead, storageWrite, type Vec2,
} from 'brometal';

/**
 * Water Bro — one radix-2 butterfly stage of the inverse FFT, on compute.
 *
 * The fragment version needed a precomputed butterfly table in a render target,
 * because a fragment shader cannot cheaply derive its own bit-reversal. On the
 * compute stage each invocation knows its own index, so the twiddle factor and
 * both operand indices are computed inline and the table disappears entirely.
 *
 * One RGBA element carries two complex numbers, RG and BA, so a single pass
 * transforms two fields at once.
 */
function complexMul(a: Vec2, b: Vec2): Vec2 {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

/** Reverse the low 7 bits — the decimation-in-time reordering, stage 0 only. */
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
  uniforms: { uStage: 'float', uVertical: 'float', uCount: 'float' },
  storage: { uSource: 'vec4', uTarget: 'vec4' },
  workgroupSize: [64, 1, 1],

  compute({ uSource, uTarget, uStage, uVertical, uCount }, id) {
    const size = 128;
    const twoPi = 6.283185307179586;

    const index = min(floor(id.x), max(uCount - 1, 0));
    const x = mod(index, size);
    const y = floor(index / size);

    // Transforming along Y is the same butterfly indexed by row instead of
    // column, so both directions share one shader.
    const along = mix(x, y, uVertical);
    const span = pow(2, uStage);
    const wing = step(mod(along, span * 2), span - 0.5);
    const twiddleK = mod(along * (size / (span * 2)), size);
    const angle = (twoPi * twiddleK) / size;
    const twiddle = vec2(cos(angle), sin(angle));

    const rawTop = mix(along - span, along, wing);
    const rawBottom = mix(along, along + span, wing);
    const first = step(uStage, 0.5);
    const topIndex = mix(rawTop, bitReverse(rawTop), first);
    const bottomIndex = mix(rawBottom, bitReverse(rawBottom), first);

    // The axis being transformed takes the butterfly index; the other passes
    // straight through. Linear index is row-major: y * size + x.
    const topLinear = mix(y * size + topIndex, topIndex * size + x, uVertical);
    const bottomLinear = mix(y * size + bottomIndex, bottomIndex * size + x, uVertical);

    const top = storageRead(uSource, topLinear);
    const bottom = storageRead(uSource, bottomLinear);

    const a = vec2(top.x, top.y).add(complexMul(twiddle, vec2(bottom.x, bottom.y)));
    const b = vec2(top.z, top.w).add(complexMul(twiddle, vec2(bottom.z, bottom.w)));
    storageWrite(uTarget, index, vec4(a.x, a.y, b.x, b.y));
  },
});
