import { shader, vec2, vec3, vec4, mix, smoothstep } from 'brometal';
import { fbm2 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2(vUv.x * uAspect, vUv.y).scale(3);
    const drift = vec2(uTime * 0.25, uTime * 0.1);
    const n = fbm2(p.add(drift), 5);
    const sky = vec3(0.16, 0.24, 0.45);
    const cloud = vec3(0.95, 0.97, 1);
    return vec4(mix(sky, cloud, smoothstep(0.35, 0.75, n)), 1);
  },
});
