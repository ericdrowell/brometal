import { shader, vec2, vec4, texture, floor, mix, type Vec2 } from 'brometal';

/**
 * Water Bro — one radix-2 butterfly stage of the inverse FFT, run as a
 * fragment pass. Technique follows Three.js Water Pro
 * (https://threejsroadmap.com/buy-threejs-water-pro), used with permission;
 * Water Pro does this in a compute shader, which BroMetal has no stage for.
 *
 * The demo dispatches this shader 2*LOG2N times per cascade per frame — seven
 * horizontal stages then seven vertical ones — ping-ponging between two
 * targets. Nothing loops inside the shader; the stage number arrives as a
 * uniform, which keeps the DSL's ban on `while`/`break` a non-issue.
 *
 * One RGBA texel carries *two* complex numbers: RG and BA. The inverse
 * transform is linear, so packing the spectra of two real fields as
 * F(a) + i*F(b) and transforming once yields a in the real part and b in the
 * imaginary part. Two complex fields per texel therefore produce four real
 * output fields for the price of one transform.
 */

/** Complex multiply — the twiddle applied to the bottom wing. */
function complexMul(a: Vec2, b: Vec2): Vec2 {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: {
    uButterfly: 'sampler2D',
    uSource: 'sampler2D',
    uStage: 'float',
    /** 0 transforms along X, 1 along Y. */
    uVertical: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment({ uButterfly, uSource, uStage, uVertical }, { vUv }) {
    // Repeated locally rather than shared: the DSL resolves only shader
    // parameters and locals, so module-level constants are out of scope.
    const size = 128;
    const stages = 7;

    const x = floor(vUv.x * size);
    const y = floor(vUv.y * size);

    // Transforming along Y is the same butterfly indexed by row instead of
    // column, so both directions share one shader.
    const along = mix(x, y, uVertical);
    const entry = texture(
      uButterfly,
      vec2((uStage * size + along + 0.5) / (stages * size), 0.5),
    );

    const twiddle = vec2(entry.x, entry.y);
    const topIndex = entry.z;
    const bottomIndex = entry.w;

    // The axis being transformed takes the butterfly's index; the other axis
    // passes straight through.
    const topUv = vec2(
      (mix(topIndex, x, uVertical) + 0.5) / size,
      (mix(y, topIndex, uVertical) + 0.5) / size,
    );
    const bottomUv = vec2(
      (mix(bottomIndex, x, uVertical) + 0.5) / size,
      (mix(y, bottomIndex, uVertical) + 0.5) / size,
    );

    const top = texture(uSource, topUv);
    const bottom = texture(uSource, bottomUv);

    const first = vec2(top.x, top.y).add(complexMul(twiddle, vec2(bottom.x, bottom.y)));
    const second = vec2(top.z, top.w).add(complexMul(twiddle, vec2(bottom.z, bottom.w)));

    return vec4(first.x, first.y, second.x, second.y);
  },
});
