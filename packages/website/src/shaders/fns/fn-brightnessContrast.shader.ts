import { shader, vec2, vec3, vec4, sin, clamp } from 'brometal';
import { brightnessContrast, hsv2rgb } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const color = hsv2rgb(vec3(vUv.x, 0.6, vUv.y));
    const contrast = 1 + 0.8 * sin(uTime);
    return vec4(clamp(brightnessContrast(color, 0, contrast), 0, 1), 1);
  },
});
