import { shader, vec2, vec3, vec4, atan, length, fract } from 'brometal';
import { hsv2rgb, fillAA, sdCircle } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
    const angle = atan(p.y, p.x) * 0.159155 + 0.5;
    const hue = fract(angle + uTime * 0.05);
    const sat = length(p) * 2.4;
    const wheel = hsv2rgb(vec3(hue, sat, 1));
    const mask = fillAA(sdCircle(p, 0.42), 0.005);
    return vec4(wheel.scale(mask), 1);
  },
});
