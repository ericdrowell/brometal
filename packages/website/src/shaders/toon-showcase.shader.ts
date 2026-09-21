import {
  abs,
  clamp,
  dot,
  mix,
  normalize,
  pow,
  shader,
  sin,
  smoothstep,
  vec3,
  vec4,
} from 'brometal';
import { specGGX, toonShade } from 'brometal/shader-functions';

/** Graphic cel shading for the dedicated Toon Shading example. */
export const ToonShowcase = shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  uniforms: {
    uViewProj: 'mat4',
    uModel: 'mat4',
    uOffset: 'vec3',
    uScale: 'float',
    uLightDir: 'vec3',
    uViewPos: 'vec3',
    uBaseColor: 'vec3',
    uAccentColor: 'vec3',
    uBands: 'float',
    uTime: 'float',
  },
  varyings: { vNormal: 'vec3', vWorld: 'vec3' },

  vertex({ aPosition, aNormal }, { uViewProj, uModel, uOffset, uScale }, v) {
    const transformed = uModel.mul(vec4(aPosition.scale(uScale), 1));
    const world = transformed.xyz.add(uOffset);
    v.vWorld = world;
    v.vNormal = normalize(uModel.mul(vec4(aNormal, 0)).xyz);
    return uViewProj.mul(vec4(world, 1));
  },

  fragment(
    { uLightDir, uViewPos, uBaseColor, uAccentColor, uBands, uTime },
    { vNormal, vWorld },
  ) {
    const normal = normalize(vNormal);
    const lightDir = normalize(uLightDir);
    const viewDir = normalize(uViewPos.sub(vWorld));
    const bands = toonShade(normal, lightDir, uBands);
    const colourShift = clamp(normal.y * 0.32 + normal.x * 0.18 + 0.52, 0, 1);
    const base = mix(uBaseColor, uAccentColor, colourShift);

    // Quantized diffuse, a hard graphic highlight, and an inner black
    // silhouette produce the familiar ink-and-paint cel-shading language.
    const specular = specGGX(normal, lightDir, viewDir, 0.28);
    const highlight = smoothstep(0.18, 0.24, specular);
    const facing = abs(dot(normal, viewDir));
    const ink = smoothstep(0.075, 0.3, facing);
    const rim = pow(1 - clamp(dot(normal, viewDir), 0, 1), 3);

    // Sparse diagonal hatching is visible only in the deepest light band.
    const stripe = sin((vWorld.x * 1.7 + vWorld.y * 2.3 + vWorld.z) * 14 + uTime * 0.18);
    const hatch = smoothstep(0.55, 0.9, stripe * 0.5 + 0.5)
      * (1 - smoothstep(0.18, 0.42, bands));

    const lit = base.scale(0.16 + bands * 0.88)
      .add(uAccentColor.scale(rim * 0.16))
      .add(vec3(1, 0.96, 0.82).scale(highlight * 0.78));
    const inked = lit.scale(0.06 + ink * 0.94 - hatch * 0.12);
    return vec4(inked, 1);
  },
});
