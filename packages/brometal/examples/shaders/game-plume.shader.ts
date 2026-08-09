import { shader, vec3, vec4, normalize, dot, abs, pow, mix, max } from 'brometal';
import { fbm3 } from 'brometal/shader-functions';

/**
 * The engine plume: one stretched sphere shaded as a volume of light.
 *
 * The previous version was 70 additive blobs whose positions were simulated on
 * the CPU and re-uploaded every frame. It read as a flat white disc, because
 * that is what a pile of constant-alpha spheres is — nothing about it varied
 * across the shape.
 *
 * This draws no particles at all. The glow is a function of where the view ray
 * enters the sphere, which is what makes it look like light rather than
 * geometry:
 *
 * - **Thickness, not surface.** A view ray through the middle of a sphere passes
 *   through more of it than one clipping the edge, and `dot(normal, viewDir)`
 *   tracks that almost exactly. Using it as the intensity means the shape fades
 *   to nothing at its own silhouette — no hard circular edge, which is what gave
 *   the blobs away.
 * - **Two lobes.** A tight high exponent for the white-hot core and a broad low
 *   one for the surrounding bloom, so the falloff is not a single flat gradient.
 * - **Turbulence** scrolling backwards along the plume axis, so the flame
 *   churns instead of sitting still.
 *
 * `uPulse` is shared with the ship's shader, so the flicker in the light and the
 * flicker on the hull are the same number rather than two noise functions that
 * drift apart.
 */
export const GamePlume = shader({
  attributes: { aPosition: 'vec3' },
  /** One per engine nacelle, in ship space. */
  instanceAttributes: { iOffset: 'vec3' },
  uniforms: {
    uViewProj: 'mat4',
    uModel: 'mat4',
    uViewPos: 'vec3',
    /** Half-extents of the plume in ship space: narrow in x/y, long in z. */
    uSize: 'vec3',
    uTime: 'float',
    uPulse: 'float',
    uCore: 'vec3',
    uEdge: 'vec3',
  },
  varyings: { vUnit: 'vec3', vNormal: 'vec3', vWorldPos: 'vec3' },

  vertex({ aPosition, iOffset }, { uViewProj, uModel, uSize }, v) {
    // The mesh is a unit sphere, so its position doubles as its normal. Keeping
    // the *unstretched* direction as the normal is deliberate: it leaves the
    // falloff round in screen space however far the plume is stretched, which
    // is what a glow should do. A correctly transformed normal would pinch the
    // bloom into the same teardrop as the geometry and look solid.
    v.vUnit = aPosition;
    v.vNormal = uModel.mul(vec4(aPosition, 0)).xyz;

    const stretched = vec3(
      aPosition.x * uSize.x,
      aPosition.y * uSize.y,
      aPosition.z * uSize.z,
    ).add(iOffset);
    const world = uModel.mul(vec4(stretched, 1));
    v.vWorldPos = world.xyz;
    return uViewProj.mul(world);
  },

  fragment(
    { uViewPos, uTime, uPulse, uCore, uEdge },
    { vUnit, vNormal, vWorldPos },
  ) {
    const viewDir = normalize(uViewPos.sub(vWorldPos));
    // How much of the sphere this ray crosses: 1 through the centre, 0 at the
    // silhouette. abs() because the far hemisphere faces away.
    const thickness = abs(dot(normalize(vNormal), viewDir));

    const core = pow(thickness, 7);
    const halo = pow(thickness, 1.5);

    // Scrolling backwards along the plume so the flame moves away from the ship.
    const churn = fbm3(
      vec3(vUnit.x * 2.6, vUnit.y * 2.6, vUnit.z * 1.7 - uTime * 5),
      3,
    );
    const flicker = 0.72 + churn * 0.55;

    // No lengthwise taper: the camera sits behind the ship, so `thickness` already
    // peaks at the point of the sphere facing it. Fading toward the tail would
    // suppress exactly the fragments that carry the glow, and the plume
    // disappears. What makes it read as attached is the hull occluding the
    // leading quarter, not a gradient.
    const intensity = max((core * 1.5 + halo * 0.85) * flicker * uPulse, 0);
    // White at the centre, cooling to the edge colour through the bloom.
    const tint = mix(uEdge, uCore, core);
    return vec4(tint.scale(intensity), intensity);
  },
});
