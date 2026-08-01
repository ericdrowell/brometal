import {
  shader, vec2, vec4, floor, mod, sqrt, exp, pow, log, sin, cos, dot, max, min,
  step, mix, length, normalize, storageWrite, type Vec2,
} from 'brometal';
import { hash22 } from 'brometal/shader-functions';

/**
 * Water Bro — JONSWAP initial spectrum, on the compute stage.
 *
 * The fragment-pass version of this wrote into a render target, which forced
 * every downstream pass to reason about which way round the backend fills a
 * target's rows. A storage buffer is a flat array with one agreed order, so that
 * entire class of bug is gone: index is y * size + x, on every backend.
 *
 * Runs once per cascade, and again only when the wind changes.
 */
function gaussian(seed: Vec2): Vec2 {
  const twoPi = 6.283185307179586;
  const u = hash22(seed);
  const radius = sqrt(0 - 2 * log(max(u.x, 1e-6)));
  const angle = twoPi * u.y;
  return vec2(radius * cos(angle), radius * sin(angle));
}

function jonswap(omega: number, peak: number): number {
  const gravity = 9.81;
  const gamma = 3.3;
  const sigma = mix(0.07, 0.09, step(peak, omega));
  const relative = (omega - peak) / (sigma * peak);
  const enhancement = pow(gamma, exp(-0.5 * relative * relative));
  const shape = exp(-1.25 * pow(peak / omega, 4));
  return (0.0081 * gravity * gravity * shape * enhancement) / pow(omega, 5);
}

export default shader({
  uniforms: {
    uPatchSize: 'float', uWindDir: 'vec2', uWindSpeed: 'float',
    uPeakWavelength: 'float', uAmplitude: 'float', uSpread: 'float',
    uBand: 'vec2', uSeed: 'float', uCount: 'float',
  },
  storage: { uSpectrum: 'vec4' },
  workgroupSize: [64, 1, 1],

  compute(
    { uSpectrum, uPatchSize, uWindDir, uWindSpeed, uPeakWavelength, uAmplitude, uSpread, uBand, uSeed, uCount },
    id,
  ) {
    const size = 128;
    const twoPi = 6.283185307179586;
    const gravity = 9.81;

    // Clamping rather than returning early: the DSL has no early return, and
    // this pass is idempotent, so a surplus invocation just rewrites the last
    // element with the value it already holds.
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
    const direction = normalize(vec2(k.x + 1e-6, k.y));

    const omega = sqrt(gravity * safeLength);
    const peak = sqrt((gravity * twoPi) / max(uPeakWavelength, 0.5));
    const energy = jonswap(max(omega, 1e-3), peak);
    const dOmegaDk = gravity / (2 * omega);

    const alignment = dot(direction, normalize(uWindDir));
    const forward = pow(max(alignment, 0), uSpread);
    const backward = 0.25 * pow(max(0 - alignment, 0), uSpread);
    const spread = forward + backward;

    const smallest = 0.002 * uWindSpeed * uWindSpeed;
    const cutoff = exp(-safeLength * safeLength * smallest * smallest);
    const band = step(uBand.x, kLength) * step(kLength, uBand.y);
    const windScale = pow(max(uWindSpeed, 0.1) / 10, 2);

    const variance =
      (2 * energy * spread * dOmegaDk * delta * delta * windScale * uAmplitude * cutoff) / safeLength;
    const scale = sqrt(max(variance, 0)) * 0.7071067811865476 * alive * band;

    const positive = gaussian(vec2(x + uSeed, y + uSeed * 1.7));
    const negative = gaussian(vec2(size - x + uSeed * 3.1, size - y + uSeed * 2.3));
    storageWrite(
      uSpectrum, index,
      vec4(positive.x * scale, positive.y * scale, negative.x * scale, negative.y * scale),
    );
  },
});
