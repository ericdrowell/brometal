import { shader, vec2, vec3, vec4, pow, mix } from 'brometal';
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
    const q = vec2(vUv.x * uAspect, vUv.y).scale(5);
    const drift1 = vec2(uTime * 0.25, uTime * 0.18);
    const drift2 = vec2(uTime * -0.2, uTime * 0.12);
    const c1 = pow(1 - voronoi2(q.add(drift1)), 4);
    const c2 = pow(1 - voronoi2(q.scale(1.7).add(drift2)), 4);
    const light = c1 * 0.8 + c2 * 0.45;
    const deep = vec3(0.02, 0.18, 0.3);
    const bright = vec3(0.6, 0.95, 1);
    return vec4(mix(deep, bright, light), 1);
  },
});
