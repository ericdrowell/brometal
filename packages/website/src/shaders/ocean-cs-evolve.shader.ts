import {
  shader, vec2, vec4, floor, mod, sqrt, sin, cos, max, min, step, length,
  storageRead, storageWrite, type Vec2,
} from 'brometal';

/**
 * Water Bro — advances the frozen spectrum to time t, on the compute stage.
 *
 * h(k,t) = h0(k)·e^(iωt) + conj(h0(-k))·e^(-iωt). The conjugate term is what
 * keeps the result real-valued; without it the transform returns complex
 * heights and the surface grows an imaginary component nobody can render.
 *
 * RG carries spec(Dx) + i·spec(Dy) and BA carries spec(Dz). The transform is
 * linear, so one pass over RG yields Dx in the real part and Dy in the
 * imaginary part — two real fields for the price of one transform.
 */
function complexMul(a: Vec2, b: Vec2): Vec2 {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

export const OceanCsEvolve = shader({
  uniforms: { uPatchSize: 'float', uTime: 'float', uCount: 'float' },
  storage: { uSpectrum: 'vec4', uField: 'vec4' },
  workgroupSize: [64, 1, 1],

  compute({ uSpectrum, uField, uPatchSize, uTime, uCount }, id) {
    const size = 128;
    const twoPi = 6.283185307179586;
    const gravity = 9.81;

    const index = min(floor(id.x), max(uCount - 1, 0));
    const x = mod(index, size);
    const y = floor(index / size);

    const n = x - size * 0.5;
    const m = y - size * 0.5;
    const delta = twoPi / uPatchSize;
    const k = vec2(n * delta, m * delta);
    const kLength = length(k);
    const alive = step(1e-4, kLength);
    const safeLength = max(kLength, 1e-4);

    const seed = storageRead(uSpectrum, index);
    const positive = vec2(seed.x, seed.y);
    const negative = vec2(seed.z, 0 - seed.w);

    const omega = sqrt(gravity * safeLength) * uTime;
    const phase = vec2(cos(omega), sin(omega));
    const conjugate = vec2(phase.x, 0 - phase.y);
    const height = complexMul(positive, phase).add(complexMul(negative, conjugate));

    // Multiplying by i·(k/|k|) both rotates the phase and points the horizontal
    // displacement along the wave's direction of travel.
    const unit = vec2((k.x / safeLength) * alive, (k.y / safeLength) * alive);
    const displaceX = vec2(height.y * unit.x, 0 - height.x * unit.x);
    const displaceZ = vec2(height.y * unit.y, 0 - height.x * unit.y);

    storageWrite(
      uField, index,
      vec4(displaceX.x - height.y, displaceX.y + height.x, displaceZ.x, displaceZ.y),
    );
  },
});
