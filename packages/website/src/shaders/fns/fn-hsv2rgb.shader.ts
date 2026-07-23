import { shader, vec2, vec3, vec4, fract } from 'brometal';
import { hsv2rgb } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    return vec4(hsv2rgb(vec3(fract(vUv.x + uTime * 0.05), vUv.y, 1)), 1);
  },
});
