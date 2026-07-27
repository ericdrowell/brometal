import {
  shader,
  vec2,
  vec3,
  vec4,
  normalize,
  texture,
  targetUv,
  dot,
  length,
  distance,
  max,
  mix,
  pow,
  step,
  clamp,
} from 'brometal';
import { hash11, specGGX, fresnel, hemisphereLight, cosinePalette } from 'brometal/shader-functions';

/**
 * Instanced spheres whose centres are read straight out of the state target in
 * the vertex shader. The CPU uploads one float per ball — its index — and never
 * learns where any of them ended up.
 */
export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  instanceAttributes: { iIndex: 'float' },
  uniforms: {
    uViewProj: 'mat4',
    uState: 'sampler2D',
    uCount: 'float',
    uRadius: 'float',
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
    uNormalOffset: 'float',
  },
  varyings: { vNormal: 'vec3', vWorld: 'vec3', vSeed: 'float', vSpeed: 'float' },

  vertex({ aPosition, aNormal, iIndex }, { uViewProj, uState, uCount, uRadius }, v) {
    const u = (iIndex + 0.5) / uCount * 0.5;
    const centre = texture(uState, vec2(u, 0.5)).xyz;
    const velocity = texture(uState, vec2(u + 0.5, 0.5)).xyz;
    const world = centre.add(aPosition.scale(uRadius));
    v.vNormal = aNormal;
    v.vWorld = world;
    v.vSeed = hash11(iIndex * 0.618 + 0.11);
    v.vSpeed = clamp(length(velocity) * 0.09, 0, 1);
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
      uNormalOffset,
    },
    { vNormal, vWorld, vSeed, vSpeed },
  ) {
    const n = normalize(vNormal);
    const viewDir = normalize(uViewPos.sub(vWorld));
    const light = normalize(uLightPos.sub(vWorld));

    // ── Does another ball stand between this point and the light? ─────────
    // A packed heap is mostly crevices, and without this the pile reads as a
    // flat field of separately lit spheres rather than a solid mass.
    const facing = max(dot(n, light), 0);
    const slope = 1 + 2 * (1 - facing);
    const lookup = vWorld.add(n.scale(uNormalOffset * slope));
    const uv = targetUv(uLightViewProj.mul(vec4(lookup, 1)));
    // Bias in world units, then normalized — subtracting it from the ratio
    // instead would scale it by uRange, and a bias wider than a ball erases
    // exactly the contact shadows that make a heap look like it is resting on
    // something.
    const reference = (distance(lookup, uLightPos) - uBias * slope) / uRange;
    let visible = 0;
    for (let sy = -1; sy < 2; sy += 1) {
      for (let sx = -1; sx < 2; sx += 1) {
        const tap = uv.add(vec2(sx, sy).scale(uTexel * uSoftness));
        visible += step(reference, texture(uShadowMap, tap).x);
      }
    }
    const sunlight = visible / 9;

    // A spread of saturated resin colours, warmed slightly while moving fast.
    const base = cosinePalette(
      vSeed,
      vec3(0.5, 0.5, 0.52),
      vec3(0.45, 0.42, 0.4),
      vec3(1, 1, 1),
      vec3(0, 0.25, 0.55),
    );
    const albedo = mix(base, base.add(vec3(0.16, 0.09, 0.02)), vSpeed);

    const ambient = hemisphereLight(n, uSkyTint, uGroundTint);
    const diffuse = facing * sunlight;
    // Two lobes: a tight polished highlight and a broader sheen, plus a fresnel
    // rim so the silhouette lifts away from whatever is behind it.
    const gloss = specGGX(n, light, viewDir, 0.16) * 1.4 * sunlight;
    const sheen = specGGX(n, light, viewDir, 0.55) * 0.25 * sunlight;
    const rim = pow(fresnel(n, viewDir, 4), 1.2) * 0.4;

    const lit = albedo.mul(ambient.add(vec3(1, 0.97, 0.92).scale(diffuse * 0.85)));
    const colour = lit.add(vec3(1, 0.98, 0.95).scale(gloss + sheen)).add(uSkyTint.scale(rim));
    // Alpha carries distance from the camera, not opacity: the glass marches
    // its reflected ray against this. On screen the value clamps to 1.
    return vec4(colour, distance(vWorld, uViewPos));
  },
});
