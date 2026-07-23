import { shader, vec2, vec3, vec4 } from 'brometal';
import { blendOverlay, hsv2rgb } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const base = hsv2rgb(vec3(vUv.x, 0.7, 0.8));
    return vec4(blendOverlay(base, vec3(vUv.y, vUv.y, vUv.y)), 1);
  },
});
