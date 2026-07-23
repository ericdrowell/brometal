import { shader, vec2, vec3, vec4 } from 'brometal';
import { rgb2hsv, cosinePalette } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const src = cosinePalette(vUv.x + uTime * 0.05, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1, 1, 1), vec3(0, 0.33, 0.67));
    let shown = src;
    if (vUv.y < 0.5) {
      shown = rgb2hsv(src);
    }
    return vec4(shown, 1);
  },
});
