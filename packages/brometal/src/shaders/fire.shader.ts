import { shader, vec2, vec3, vec4, clamp, pow } from 'brometal';
import { fbm2 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const q = vec2(vUv.x * uAspect * 2.4, vUv.y * 2 - uTime * 1.3);
    const n = fbm2(q.scale(2.2), 5);
    const shape = clamp(1.25 - vUv.y * 1.6 + (n - 0.5) * 1.1, 0, 1);
    const heat = pow(shape, 1.6);
    return vec4(pow(heat, 0.8) * 1.05, pow(heat, 2.2), pow(heat, 6), 1);
  },
});
