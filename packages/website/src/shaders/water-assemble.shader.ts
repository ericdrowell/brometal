import { shader, vec2, vec3, vec4, texture, floor, mod, fract, min, max, mix, step } from 'brometal';

/**
 * Water Bro — turns raw transform output into the displacement map the surface
 * samples. Follows Three.js Water Pro
 * (https://threejsroadmap.com/buy-threejs-water-pro), used with permission.
 *
 * Three things happen here:
 *
 * 1. The (-1)^(x+y) sign flip. The spectrum was built centred on k = 0, which
 *    costs a half-period shift in the output; alternating the sign undoes it.
 *    Skip this and the ocean tiles with a visible checker.
 * 2. Unpacking. RG's real part is Dx and its imaginary part is Dy — the pairing
 *    the evolution pass set up.
 * 3. Foam. The Jacobian of the horizontal displacement measures how much the
 *    surface is being compressed; where it goes negative the water has folded
 *    over itself, which is exactly where whitecaps belong. Derivatives are
 *    finite differences over neighbouring texels, wrapped with `fract` because
 *    render targets clamp at their edges and the patch has to tile.
 */

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: {
    uTransform: 'sampler2D',
    /** Patch size in metres — sets the world distance one texel spans. */
    uPatchSize: 'float',
    /** Horizontal displacement gain — 0 is a smooth swell, higher sharpens crests. */
    uChoppiness: 'float',
    uScale: 'float',
    /** Jacobian below this counts as folded, and starts accumulating foam. */
    uFoamThreshold: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment({ uTransform, uPatchSize, uChoppiness, uScale, uFoamThreshold }, { vUv }) {
    // Local rather than module-level: the DSL resolves only parameters and locals.
    const size = 128;
    const x = floor(vUv.x * size);
    const y = floor(vUv.y * size);

    // Alternating sign undoes the centred-spectrum half-period shift.
    const sign = 1 - 2 * mod(x + y, 2);
    const gain = uScale * sign;

    const centre = texture(uTransform, vUv);
    const displacement = vec3(
      centre.x * uChoppiness * gain,
      centre.y * gain,
      centre.z * uChoppiness * gain,
    );

    // Neighbours for the Jacobian. The sign flip alternates per texel, so a
    // neighbour one step away carries the opposite sign — hence the negation.
    const texel = 1 / size;
    const right = texture(uTransform, vec2(fract(vUv.x + texel), vUv.y));
    const up = texture(uTransform, vec2(vUv.x, fract(vUv.y + texel)));

    // Per metre, not per texel. One texel spans uPatchSize/size metres, so the
    // difference divides by that — dividing by texel count instead leaves the
    // derivatives ~128x too large, the Jacobian swinging hugely negative, and
    // foam saturating across the entire ocean.
    const perMetre = size / uPatchSize;
    const dxdx = (0 - right.x * uChoppiness * gain - displacement.x) * perMetre;
    const dzdx = (0 - right.z * uChoppiness * gain - displacement.z) * perMetre;
    const dxdz = (0 - up.x * uChoppiness * gain - displacement.x) * perMetre;
    const dzdz = (0 - up.z * uChoppiness * gain - displacement.z) * perMetre;

    const jacobian = (1 + dxdx) * (1 + dzdz) - dxdz * dzdx;
    const foam = max(uFoamThreshold - jacobian, 0);

    return vec4(displacement.x, displacement.y, displacement.z, foam);
  },
});
