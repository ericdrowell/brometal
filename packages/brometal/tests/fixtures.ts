export const CUBE_SHADER = `
import { shader, vec4 } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aColor: 'vec3' },
  uniforms: { uMvp: 'mat4' },
  varyings: { vColor: 'vec3' },

  vertex({ aPosition, aColor }, { uMvp }, v) {
    v.vColor = aColor;
    return uMvp.mul(vec4(aPosition, 1));
  },

  fragment(_uniforms, { vColor }) {
    return vec4(vColor, 1);
  },
});
`;

export const LIGHTING_SHADER = `
import { shader, vec3, vec4, normalize, dot, mix, clamp, max } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  uniforms: { uMvp: 'mat4', uLightDir: 'vec3', uAmbient: 'float' },
  varyings: { vNormal: 'vec3' },

  vertex({ aPosition, aNormal }, { uMvp }, v) {
    v.vNormal = aNormal;
    return uMvp.mul(vec4(aPosition, 1));
  },

  fragment({ uLightDir, uAmbient }, { vNormal }) {
    const n = normalize(vNormal);
    const diffuse = max(dot(n, normalize(uLightDir)), 0);
    const intensity = clamp(uAmbient + diffuse, 0, 1);
    const base = vec3(0.8, 0.3, 0.2);
    const lit = mix(vec3(0, 0, 0), base, intensity);
    return vec4(lit, 1);
  },
});
`;

export const INSTANCED_SHADER = `
import { shader, vec4, sin, cos, cross, dot } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aColor: 'vec3' },
  instanceAttributes: { iOffset: 'vec3', iAxis: 'vec3', iSpeed: 'float' },
  uniforms: { uViewProj: 'mat4', uTime: 'float' },
  varyings: { vColor: 'vec3' },

  vertex({ aPosition, aColor, iOffset, iAxis, iSpeed }, { uViewProj, uTime }, v) {
    const angle = uTime * iSpeed;
    const c = cos(angle);
    const s = sin(angle);
    const rotated = aPosition.scale(c)
      .add(cross(iAxis, aPosition).scale(s))
      .add(iAxis.scale(dot(iAxis, aPosition) * (1 - c)));
    v.vColor = aColor;
    return uViewProj.mul(vec4(rotated.add(iOffset), 1));
  },

  fragment(_uniforms, { vColor }) {
    return vec4(vColor, 1);
  },
});
`;

export const BRANCHING_SHADER = `
import { shader, vec4 } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec2' },
  uniforms: { uThreshold: 'float' },
  varyings: { vFade: 'float' },

  vertex({ aPosition }, { uThreshold }, v) {
    v.vFade = 0.5;
    if (aPosition.x < uThreshold) {
      const boosted = aPosition.x * 2 + 1;
      v.vFade = boosted;
    } else {
      v.vFade = -aPosition.y;
    }
    return vec4(aPosition, 0, 1);
  },

  fragment(_u, { vFade }) {
    return vec4(vFade, vFade, vFade, 1);
  },
});
`;
