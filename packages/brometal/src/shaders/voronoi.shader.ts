import { shader, vec2, vec3, vec4, pow } from 'brometal';
import { voronoi2 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2(vUv.x * uAspect, vUv.y).scale(6);
    const drift = vec2(uTime * 0.3, uTime * 0.2);
    const d = voronoi2(p.add(drift));
    const glow = pow(1 - d, 3);
    return vec4(vec3(glow * 0.2, glow * 0.7, glow), 1);
  },
});
