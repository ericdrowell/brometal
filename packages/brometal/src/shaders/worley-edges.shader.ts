import { shader, vec2, vec3, vec4, smoothstep, mix, pow } from 'brometal';
import { worleyEdge2 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const q = vec2(vUv.x * uAspect, vUv.y).scale(5).add(vec2(uTime * 0.15, uTime * 0.1));
    const e = worleyEdge2(q);
    const line = 1 - smoothstep(0, 0.08, e);
    const cellGlow = pow(1 - smoothstep(0, 0.6, e), 2) * 0.25;
    const base = vec3(0.06, 0.04, 0.12);
    const edgeColor = vec3(0.5, 1, 0.85);
    return vec4(mix(base, edgeColor, line).add(edgeColor.scale(cellGlow)), 1);
  },
});
