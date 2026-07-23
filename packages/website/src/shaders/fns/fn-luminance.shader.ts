import { shader, vec2, vec3, vec4 } from 'brometal';
import { luminance, hsv2rgb } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const color = hsv2rgb(vec3(vUv.x, 0.85, 0.95));
    let shown = color;
    if (vUv.x > 0.5) {
      const g = luminance(hsv2rgb(vec3(vUv.x - 0.5, 0.85, 0.95)));
      shown = vec3(g, g, g);
    }
    return vec4(shown, 1);
  },
});
