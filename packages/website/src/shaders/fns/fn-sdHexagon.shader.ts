import { shader, vec2, vec3, vec4, cos, abs, smoothstep, mix } from 'brometal';
import { sdHexagon } from 'brometal/shader-functions';

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
    const d = sdHexagon(p, 0.25);
    let color = vec3(0.9, 0.55, 0.25);
    if (d > 0) {
      color = vec3(0.35, 0.55, 0.95);
    }
    color = color.scale(0.75 + 0.25 * cos(d * 50));
    const zero = 1 - smoothstep(0.004, 0.014, abs(d));
    color = mix(color, vec3(1, 1, 1), zero);
    return vec4(color, 1);
  },
});
