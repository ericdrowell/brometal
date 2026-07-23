import { shader, vec2, vec4, floor, mod, mix } from 'brometal';
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
    const q = rotate2(vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5), uTime * 0.4).scale(7);
    const c = mod(floor(q.x) + floor(q.y), 2);
    const tone = mix(0.15, 0.9, c);
    return vec4(tone, tone, tone, 1);
  },
});
