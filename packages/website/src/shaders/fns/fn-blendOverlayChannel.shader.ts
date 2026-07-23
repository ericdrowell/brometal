import { shader, vec2, vec4 } from 'brometal';
import { blendOverlayChannel } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const v = blendOverlayChannel(vUv.x, vUv.y);
    return vec4(v, v, v, 1);
  },
});
