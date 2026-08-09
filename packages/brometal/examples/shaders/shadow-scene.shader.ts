import {
  shader,
  vec2,
  vec3,
  vec4,
  dot,
  max,
  min,
  mix,
  mod,
  step,
  floor,
  length,
  distance,
  normalize,
  smoothstep,
  texture,
  targetUv,
} from 'brometal';
import {
  rotate3,
  blinnPhongSpec,
  hemisphereLight,
  tonemapACES,
  gammaCorrect,
  shadowFactor,
} from 'brometal/shader-functions';

/**
 * The lit pass. Everything here is ordinary Blinn-Phong except the one extra
 * question each fragment asks: from where the light stands, is anything closer?
 *
 * `targetUv` is what makes that question correct. NDC +y and texture v disagree
 * about which row of a render target NDC +y lands on, so hand-rolling
 * `clip.xy / clip.w * 0.5 + 0.5` mirrors the lookup on one of the two backends
 * — and a mirrored shadow still looks like a shadow, just attached to the wrong
 * side of the object, which is a miserable thing to debug.
 */
export const ShadowScene = shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  instanceAttributes: {
    iOffset: 'vec3',
    iScale: 'vec3',
    iSpin: 'float',
    iColor: 'vec3',
    iGround: 'float',
  },
  uniforms: {
    uViewProj: 'mat4',
    uLightViewProj: 'mat4',
    uShadowMap: 'sampler2D',
    uLightPos: 'vec3',
    uViewPos: 'vec3',
    uLightColor: 'vec3',
    uSkyColor: 'vec3',
    uGroundColor: 'vec3',
    uFogColor: 'vec3',
    uTime: 'float',
    uRange: 'float',
    uTexel: 'float',
    uSoftness: 'float',
    uBias: 'float',
    uShadowStrength: 'float',
  },
  varyings: { vWorld: 'vec3', vNormal: 'vec3', vColor: 'vec3', vGround: 'float' },

  vertex({ aPosition, aNormal, iOffset, iScale, iSpin, iColor, iGround }, { uViewProj, uTime }, v) {
    const angle = iSpin * uTime;
    const world = rotate3(aPosition.mul(iScale), vec3(0, 1, 0), angle).add(iOffset);
    // Dividing by the scale is what keeps normals perpendicular under a
    // non-uniform one — the ground slab is 40 across and a fifth of a unit
    // thick, and scaling its normal directly would tip every one of them.
    v.vNormal = rotate3(aNormal.div(iScale), vec3(0, 1, 0), angle);
    v.vWorld = world;
    v.vColor = iColor;
    v.vGround = iGround;
    return uViewProj.mul(vec4(world, 1));
  },

  fragment(
    {
      uLightViewProj,
      uShadowMap,
      uLightPos,
      uViewPos,
      uLightColor,
      uSkyColor,
      uGroundColor,
      uFogColor,
      uRange,
      uTexel,
      uSoftness,
      uBias,
      uShadowStrength,
    },
    { vWorld, vNormal, vColor, vGround },
  ) {
    const n = normalize(vNormal);
    const toLight = uLightPos.sub(vWorld);
    const lightDistance = length(toLight);
    const l = toLight.scale(1 / lightDistance);
    const viewDir = normalize(uViewPos.sub(vWorld));
    const ndl = max(dot(n, l), 0);

    // ── Is anything between this point and the light? ─────────────────────
    // shadowFactor owns the two things that fail silently here: the per-backend
    // uv (a hand-rolled one is mirrored on one of the two) and the bias units.
    const visible = shadowFactor(
      uShadowMap, uLightViewProj, vWorld, n, uLightPos, uRange, uTexel, uSoftness, uBias,
    );
    const lit = 1 - (1 - visible) * uShadowStrength;

    // ── Ordinary shading, with the shadow gating the direct terms only ────
    const specular = blinnPhongSpec(n, l, viewDir, 48) * lit * (1 - vGround * 0.75);
    const ambient = hemisphereLight(n, uSkyColor, uGroundColor);
    // Inverse-square would black out the far corners of a slab this wide, so
    // the falloff is deliberately gentler than physical.
    const falloff = 1 / (1 + lightDistance * lightDistance * 0.012);

    // A faint checker on the ground only. Shadows are far easier to read
    // against a surface that has some texture to be interrupted.
    const checker = mod(floor(vWorld.x * 0.5) + floor(vWorld.z * 0.5), 2);
    const albedo = mix(vColor, vColor.scale(0.78), checker * vGround);

    const direct = uLightColor.scale(ndl * lit * falloff * 2.4);
    const linear = albedo.mul(ambient.add(direct)).add(uLightColor.scale(specular * 0.9));

    // Fade the slab into the background so its edge is not a hard horizon.
    const fade = 1 - smoothstep(14, 19, length(vWorld.xz));
    const tonemapped = gammaCorrect(tonemapACES(linear), 2.2);
    return vec4(mix(uFogColor, tonemapped, max(fade, 1 - vGround)), 1);
  },
});
