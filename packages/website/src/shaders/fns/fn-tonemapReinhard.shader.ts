import { shader, vec2, vec3, vec4, clamp } from 'brometal';
import { tonemapReinhard } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const hdr = vec3(vUv.x * 4, vUv.x * 3.2, vUv.x * 2.2);
    let shown = clamp(hdr, 0, 1);
    if (vUv.y < 0.5) {
      shown = tonemapReinhard(hdr);
    }
    return vec4(shown, 1);
  },
});
