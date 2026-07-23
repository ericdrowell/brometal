import { shader, vec2, vec3, vec4, atan, length, abs, fract } from 'brometal';
import { fbm2, cosinePalette } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
    const angle = atan(p.y, p.x) * 0.159155;
    const seg = abs(fract(angle * 6 + uTime * 0.05) - 0.5) * 2;
    const radius = length(p);
    const n = fbm2(vec2(seg * 3, radius * 5 - uTime * 0.4), 4);
    const color = cosinePalette(n + radius, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1, 1, 0.7), vec3(0.1, 0.45, 0.8));
    return vec4(color, 1);
  },
});
