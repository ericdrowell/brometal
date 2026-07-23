import { shader, vec2, vec3, vec4, sin, cos, sqrt, length } from 'brometal';
import { fresnel } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5).scale(2.3);
    const r = length(p);
    const lightDir = vec3(cos(uTime * 0.9), 0.6, sin(uTime * 0.9));
    let color = vec3(0.07, 0.07, 0.11);
    if (r < 1) {
      const normal = vec3(p.x, p.y, sqrt(1 - r * r));
      const v = fresnel(normal, vec3(0, 0, 1), 3);
      color = vec3(v, v, v);
    }
    return vec4(color, 1);
  },
});
