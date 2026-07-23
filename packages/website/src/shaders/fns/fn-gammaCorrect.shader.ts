import { shader, vec2, vec3, vec4 } from 'brometal';
import { gammaCorrect } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const ramp = vec3(vUv.x, vUv.x, vUv.x);
    let shown = ramp;
    if (vUv.y < 0.5) {
      shown = gammaCorrect(ramp, 2.2);
    }
    return vec4(shown, 1);
  },
});
