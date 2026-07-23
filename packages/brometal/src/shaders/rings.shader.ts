import { shader, vec2, vec3, vec4, length, abs, fract, smoothstep } from 'brometal';
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
    const wobble = fbm2(p.scale(3).add(vec2(uTime * 0.2, 0)), 3) * 2;
    const d = length(p) * 9 - uTime + wobble;
    const ring = 1 - smoothstep(0.45, 0.55, abs(fract(d) - 0.5) * 2);
    const color = cosinePalette(length(p) * 1.5 + uTime * 0.08, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1, 1, 1), vec3(0, 0.33, 0.67));
    return vec4(color.scale(ring), 1);
  },
});
