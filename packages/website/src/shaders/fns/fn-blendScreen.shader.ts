import { shader, vec2, vec3, vec4, length, smoothstep, sin, cos } from 'brometal';
import { blendScreen, hsv2rgb } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const base = hsv2rgb(vec3(vUv.x, 0.8, 0.5));
    const center = vec2(0.5 + 0.3 * cos(uTime) / uAspect * uAspect, 0.5 + 0.3 * sin(uTime));
    const glow = 1 - smoothstep(0, 0.4, length(vec2((vUv.x - center.x) * uAspect, vUv.y - center.y)));
    return vec4(blendScreen(base, vec3(glow, glow, glow)), 1);
  },
});
