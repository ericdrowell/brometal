import { shader, vec2, vec3, vec4, floor, mod, mix, sqrt, max, length, normalize, smoothstep } from 'brometal';
import { rotate3 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    // A shaded ball wearing a 3D checker, spun around a tilted axis.
    const q = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
    const r = length(q);
    const z = sqrt(max(0.2025 - r * r, 0));
    const n = normalize(vec3(q.x, q.y, z));
    const rn = rotate3(n, normalize(vec3(0.5, 1, 0.3)), uTime * 0.8);
    const c = mod(floor(rn.x * 3 + 3) + floor(rn.y * 3 + 3) + floor(rn.z * 3 + 3), 2);
    const shade = mix(0.2, 1, c) * (n.z * 0.75 + 0.25);
    const mask = 1 - smoothstep(0.44, 0.45, r);
    const tone = shade * mask + 0.08 * (1 - mask);
    return vec4(tone, tone, tone, 1);
  },
});
