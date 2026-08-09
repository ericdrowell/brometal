import {
  shader,
  vec2,
  vec4,
  texture,
  floor,
  sqrt,
  sin,
  cos,
  max,
  step,
  length,
  type Vec2,
} from 'brometal';

/**
 * Water Bro — advances the frozen spectrum to time t and packs the four
 * displacement fields the transform will produce. Follows Three.js Water Pro
 * (https://threejsroadmap.com/buy-threejs-water-pro), used with permission.
 *
 * h(k,t) = h0(k)·e^(iωt) + conj(h0(-k))·e^(-iωt)
 *
 * The conjugate term is what keeps the result real-valued: without it the
 * inverse transform returns complex heights and the surface develops an
 * imaginary component nobody can render.
 *
 * Horizontal displacement — the "choppiness" that sharpens crests into peaks
 * and flattens troughs — is the height spectrum rotated a quarter turn and
 * scaled by the unit wavevector.
 *
 * Packing: RG = spec(Dx) + i·spec(Dy), BA = spec(Dz). Because the transform is
 * linear, one pass over RG returns Dx in its real part and Dy in its imaginary
 * part. BA's imaginary half is spare capacity — a fourth field could ride there
 * for free if the surface ever wants an analytic slope instead of the finite
 * differences it takes today.
 */

/** Complex multiply. */
function complexMul(a: Vec2, b: Vec2): Vec2 {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

export const WaterEvolve = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: {
    uSpectrum: 'sampler2D',
    uPatchSize: 'float',
    uTime: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment({ uSpectrum, uPatchSize, uTime }, { vUv }) {
    // Local rather than module-level: the DSL resolves only parameters and locals.
    const size = 128;
    const twoPi = 6.283185307179586;
    const gravity = 9.81;

    const x = floor(vUv.x * size);
    const y = floor(vUv.y * size);

    const n = x - size * 0.5;
    const m = y - size * 0.5;
    const delta = twoPi / uPatchSize;
    const k = vec2(n * delta, m * delta);
    const kLength = length(k);
    const alive = step(1e-4, kLength);
    const safeLength = max(kLength, 1e-4);

    const seed = texture(uSpectrum, vUv);
    const positive = vec2(seed.x, seed.y);
    // conj(h0(-k)) — the negative-frequency partner, mirrored back.
    const negative = vec2(seed.z, 0 - seed.w);

    // Deep-water dispersion. Quantising ω to a period would let the whole
    // surface loop seamlessly; left continuous here, the sea never repeats.
    const omega = sqrt(gravity * safeLength) * uTime;
    const phase = vec2(cos(omega), sin(omega));
    const conjugatePhase = vec2(phase.x, 0 - phase.y);

    const height = complexMul(positive, phase).add(complexMul(negative, conjugatePhase));

    // Multiplying by i·(k/|k|) both rotates the phase and points the
    // displacement along the wave's direction of travel.
    const unit = vec2((k.x / safeLength) * alive, (k.y / safeLength) * alive);
    const displaceX = vec2(height.y * unit.x, 0 - height.x * unit.x);
    const displaceZ = vec2(height.y * unit.y, 0 - height.x * unit.y);

    // RG = spec(Dx) + i·spec(Dy): one transform, two real fields out.
    return vec4(
      displaceX.x - height.y,
      displaceX.y + height.x,
      displaceZ.x,
      displaceZ.y,
    );
  },
});
