import { shader, vec2, vec3, vec4, normalize, dot, max, mix, length, fract, clamp, type Vec2 } from 'brometal';
import { easeInOutCubic } from 'brometal/shader-functions';

function rippleHeight(uv: Vec2, phaseTime: number, spacing: number): number {
  const dist = length(uv.sub(vec2(0.5, 0.5)));
  const phase = clamp(fract(phaseTime - dist * spacing), 0, 1);
  // easeInOutCubic(t) - t is an S-shaped deviation peaking at ±0.1875; scale
  // it back up so the rings stand as tall as the old spring curve did.
  const wave = (easeInOutCubic(phase) - phase) * 2.6;
  const falloff = clamp(1.15 - dist * 1.55, 0, 1);
  return wave * falloff;
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: {
    uViewProj: 'mat4',
    uModel: 'mat4',
    uPhase: 'float',
    uSpacing: 'float',
    uAmp: 'float',
    uLightDir: 'vec3',
  },
  varyings: { vNormal: 'vec3', vHeight: 'float' },

  vertex({ aPosition, aUv }, { uViewProj, uModel, uPhase, uSpacing, uAmp }, v) {
    const h = rippleHeight(aUv, uPhase, uSpacing);
    const e = 0.0039;
    const hx = rippleHeight(aUv.add(vec2(e, 0)), uPhase, uSpacing);
    const hy = rippleHeight(aUv.add(vec2(0, e)), uPhase, uSpacing);
    const normal = normalize(vec3((h - hx) * uAmp * 30, (h - hy) * uAmp * 30, 1));
    const displaced = vec4(aPosition.x, aPosition.y, h * uAmp, 1);
    const world = uModel.mul(displaced);
    v.vNormal = uModel.mul(vec4(normal, 0)).xyz;
    // Ring heights span roughly ±0.5, recentered so 0.5 is flat rest level —
    // the same [0, 1] height range the terrain material mixes over.
    v.vHeight = clamp(h, -0.5, 0.5) + 0.5;
    return uViewProj.mul(world);
  },

  fragment({ uLightDir }, { vNormal, vHeight }) {
    // Same material as the terrain example: height-mixed deep blue to sand,
    // lambert-lit.
    const diffuse = max(dot(normalize(vNormal), normalize(uLightDir)), 0);
    const low = vec3(0.1, 0.25, 0.35);
    const high = vec3(0.85, 0.8, 0.7);
    return vec4(mix(low, high, vHeight).scale(0.3 + diffuse * 0.8), 1);
  },
});
