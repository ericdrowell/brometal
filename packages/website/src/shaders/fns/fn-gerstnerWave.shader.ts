import { shader, vec2, vec3, vec4, mix, clamp } from 'brometal';
import { gerstnerWave } from 'brometal/shader-functions';

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
    const w1 = gerstnerWave(p, vec2(1, 0.4), 0.9, 2.2, uTime);
    const w2 = gerstnerWave(p, vec2(-0.6, 1), 0.7, 1.3, uTime);
    const h = (w1.z + w2.z) * 1.6 + 0.5;
    const deep = vec3(0.05, 0.15, 0.3);
    const crest = vec3(0.75, 0.9, 1);
    return vec4(mix(deep, crest, clamp(h, 0, 1)), 1);
  },
});
