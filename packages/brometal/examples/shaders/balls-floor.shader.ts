import {
  shader,
  vec2,
  vec3,
  vec4,
  texture,
  targetUv,
  dot,
  max,
  mix,
  step,
  length,
  distance,
  normalize,
  smoothstep,
} from 'brometal';
import { specGGX, hemisphereLight, shadowFactor } from 'brometal/shader-functions';

/**
 * The tank's base. It exists to catch the pile's shadow — with a handful of
 * balls the shadows underneath are most of what sells them as sitting on
 * something, and once the floor is covered by a full heap it costs one quad.
 *
 * Drawn opaque and just inside the glass, so the bottom pane still reads as
 * glass from below without the two z-fighting.
 */
export const BallsFloor = shader({
  attributes: { aPosition: 'vec3' },
  uniforms: {
    uViewProj: 'mat4',
    uBounds: 'vec3',
    uViewPos: 'vec3',
    uLightPos: 'vec3',
    uSkyTint: 'vec3',
    uGroundTint: 'vec3',
    uLightViewProj: 'mat4',
    uShadowMap: 'sampler2D',
    uRange: 'float',
    uTexel: 'float',
    uSoftness: 'float',
    uBias: 'float',
  },
  varyings: { vWorld: 'vec3', vLocal: 'vec2' },

  vertex({ aPosition }, { uViewProj, uBounds }, v) {
    // The quad is authored in XY at ±1; this lays it flat at the tank's floor.
    // A hair above the pane rather than level with it — coplanar surfaces pick
    // a winner per pixel and the seam crawls as the camera orbits.
    const world = vec3(aPosition.x * uBounds.x, 0 - uBounds.y + 0.004, aPosition.y * uBounds.z);
    v.vWorld = world;
    v.vLocal = vec2(aPosition.x, aPosition.y);
    return uViewProj.mul(vec4(world, 1));
  },

  fragment(
    {
      uViewPos,
      uLightPos,
      uSkyTint,
      uGroundTint,
      uLightViewProj,
      uShadowMap,
      uRange,
      uTexel,
      uSoftness,
      uBias,
    },
    { vWorld, vLocal },
  ) {
    const n = vec3(0, 1, 0);
    const viewDir = normalize(uViewPos.sub(vWorld));
    const light = normalize(uLightPos.sub(vWorld));
    const facing = max(dot(n, light), 0);

    const sunlight = shadowFactor(
      uShadowMap, uLightViewProj, vWorld, n, uLightPos, uRange, uTexel, uSoftness, uBias,
    );

    const ambient = hemisphereLight(n, uSkyTint, uGroundTint);
    const albedo = vec3(0.09, 0.095, 0.115);
    const gloss = specGGX(n, light, viewDir, 0.34) * 0.5 * sunlight;
    const lit = albedo.mul(ambient.add(vec3(1, 0.97, 0.92).scale(facing * sunlight * 0.9)));

    // Darken into the corners, so the base does not end in four bright seams.
    const corner = 1 - smoothstep(0.72, 1, length(vLocal)) * 0.55;
    // Alpha is distance from the camera — see the note in balls-render.
    return vec4(lit.add(vec3(1, 0.99, 0.96).scale(gloss)).scale(corner), distance(vWorld, uViewPos));
  },
});
