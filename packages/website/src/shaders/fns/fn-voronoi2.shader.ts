import { shader, vec2, vec4 } from 'brometal';
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
    const p = vec2(vUv.x * uAspect, vUv.y).scale(5).add(vec2(uTime * 0.3, uTime * 0.12));
    const n = voronoi2(p);
    return vec4(n, n, n, 1);
  },
});
