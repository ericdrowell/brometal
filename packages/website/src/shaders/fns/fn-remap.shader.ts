import { shader, vec2, vec4, clamp } from 'brometal';
import { remap } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    let n = vUv.x;
    if (vUv.y < 0.5) {
      n = clamp(remap(vUv.x, 0.3, 0.7, 0, 1), 0, 1);
    }
    return vec4(n, n, n, 1);
  },
});
