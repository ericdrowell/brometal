import {
  shader,
  vec2,
  vec4,
  floor,
  mod,
  sqrt,
  exp,
  pow,
  log,
  sin,
  cos,
  dot,
  max,
  min,
  step,
  mix,
  length,
  normalize,
  type Vec2,
} from 'brometal';
import { hash22 } from 'brometal/shader-functions';

/**
 * Water Bro — the JONSWAP initial spectrum h0(k), following Three.js Water Pro
 * (https://threejsroadmap.com/buy-threejs-water-pro), used with permission.
 *
 * Runs once per cascade at startup and again whenever the wind changes, never
 * per frame: h0 is the sea state's *shape*, and the per-frame pass only rotates
 * its phases forward in time.
 *
 * Water Pro seeds its Gaussians from a noise texture. BroMetal's `createTexture`
 * only accepts an 8-bit `TexImageSource`, which is far too coarse for spectrum
 * amplitudes, so the Gaussians are generated on the GPU instead — Box–Muller
 * over a hash. Same distribution, no upload, and it stays deterministic.
 *
 * RG holds h0(k); BA holds h0(-k), which the evolution pass conjugates. Storing
 * both here keeps the per-frame pass down to a single texture read.
 */

/**
 * Box–Muller: two uniform samples in, two independent standard normals out.
 *
 * Constants are repeated as locals in each function here — the DSL resolves
 * only shader parameters and locals, so module-level values are out of scope.
 */
function gaussian(seed: Vec2): Vec2 {
  const twoPi = 6.283185307179586;
  const u = hash22(seed);
  // log(0) is -inf; clamp the first sample away from zero before taking it.
  const radius = sqrt(0 - 2 * log(max(u.x, 1e-6)));
  const angle = twoPi * u.y;
  return vec2(radius * cos(angle), radius * sin(angle));
}

/**
 * JONSWAP energy density at angular frequency `omega`, for a sea peaking at
 * `peak`. This is the fetch-limited spectrum — narrower and taller than
 * Pierson–Moskowitz, which is what makes wind-driven water read as *driven*
 * rather than fully developed.
 */
function jonswap(omega: number, peak: number): number {
  const gravity = 9.81;
  const gamma = 3.3; // peak-enhancement factor
  // The peak width is asymmetric: narrower below the peak than above it.
  const sigma = mix(0.07, 0.09, step(peak, omega));
  const relative = (omega - peak) / (sigma * peak);
  const enhancement = pow(gamma, exp(-0.5 * relative * relative));
  const shape = exp(-1.25 * pow(peak / omega, 4));
  return (0.0081 * gravity * gravity * shape * enhancement) / pow(omega, 5);
}

export const WaterSpectrum = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: {
    /** Side length of this cascade's patch, in metres. */
    uPatchSize: 'float',
    /** Normalised wind direction in the XZ plane. */
    uWindDir: 'vec2',
    uWindSpeed: 'float',
    /** Wavelength carrying the most energy, in metres. */
    uPeakWavelength: 'float',
    uAmplitude: 'float',
    /** Directional spreading exponent — higher is a tighter fan around the wind. */
    uSpread: 'float',
    /** Wavenumber band [min, max) this cascade owns, so cascades never overlap. */
    uBand: 'vec2',
    uSeed: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment(
    { uPatchSize, uWindDir, uWindSpeed, uPeakWavelength, uAmplitude, uSpread, uBand, uSeed },
    { vUv },
  ) {
    const size = 128;
    const twoPi = 6.283185307179586;
    const gravity = 9.81;

    const x = floor(vUv.x * size);
    const y = floor(vUv.y * size);

    // Centre the grid on k = 0 so the transform's DC term lands mid-texture.
    // The assembly pass undoes the resulting half-period shift.
    const n = x - size * 0.5;
    const m = y - size * 0.5;
    const delta = twoPi / uPatchSize;
    const k = vec2(n * delta, m * delta);
    const kLength = length(k);

    // k = 0 has no direction and infinite wavelength; the whole texel is masked
    // off rather than branched around, which keeps control flow uniform.
    const alive = step(1e-4, kLength);
    const safeLength = max(kLength, 1e-4);
    const direction = normalize(vec2(k.x + 1e-6, k.y));

    // Deep-water dispersion, and its derivative — the Jacobian that converts an
    // energy density in frequency into one in wavenumber.
    const omega = sqrt(gravity * safeLength);
    const peak = sqrt((gravity * twoPi) / max(uPeakWavelength, 0.5));
    const energy = jonswap(max(omega, 1e-3), peak);
    const dOmegaDk = gravity / (2 * omega);

    // Directional spreading, with a weaker lobe running back against the wind
    // so the sea is not perfectly one-way.
    const alignment = dot(direction, normalize(uWindDir));
    const forward = pow(max(alignment, 0), uSpread);
    const backward = 0.25 * pow(max(0 - alignment, 0), uSpread);
    const spread = forward + backward;

    // Waves far shorter than the wind can raise are cut off, otherwise the
    // spectrum keeps feeding energy into ripples that only ever alias.
    const smallest = 0.002 * uWindSpeed * uWindSpeed;
    const cutoff = exp(-safeLength * safeLength * smallest * smallest);

    // Each cascade keeps only its own slice of wavenumber, so the three of them
    // tile the spectrum instead of tripling the same waves.
    const band = step(uBand.x, kLength) * step(kLength, uBand.y);

    const windScale = pow(max(uWindSpeed, 0.1) / 10, 2);
    const variance =
      (2 * energy * spread * dOmegaDk * delta * delta * windScale * uAmplitude * cutoff) /
      safeLength;
    const scale = sqrt(max(variance, 0)) * 0.7071067811865476 * alive * band;

    // Independent draws for k and -k. The evolution pass conjugates the second
    // one; keeping both here makes that a single texture fetch per frame.
    const positive = gaussian(vec2(x + uSeed, y + uSeed * 1.7));
    const negative = gaussian(vec2(size - x + uSeed * 3.1, size - y + uSeed * 2.3));

    return vec4(
      positive.x * scale,
      positive.y * scale,
      negative.x * scale,
      negative.y * scale,
    );
  },
});
