import { shader, vec2, vec3, vec4, atan, length, floor, mod, smoothstep, mix } from 'brometal';
import { rotate2 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = rotate2(vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5), uTime * 0.1);
    const radius = length(p) + 0.0001;
    const angle = atan(p.y, p.x) * 0.159155;
    const depth = 0.25 / radius + uTime * 0.7;
    const c = mod(floor(angle * 12) + floor(depth * 6), 2);
    const fog = smoothstep(0.02, 0.4, radius);
    const tone = mix(0.1, 1, c) * fog;
    return vec4(tone, tone * 0.7, tone * 0.4, 1);
  },
});
