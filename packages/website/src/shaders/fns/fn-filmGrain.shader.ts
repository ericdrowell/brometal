import { shader, vec2, vec3, vec4 } from 'brometal';
import { filmGrain } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const g = 0.5 + filmGrain(vUv, uTime) * 0.25;
    return vec4(g, g, g, 1);
  },
});
