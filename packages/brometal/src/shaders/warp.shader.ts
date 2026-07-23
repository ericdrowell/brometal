import { shader, vec2, vec3, vec4 } from 'brometal';
import { warp2, cosinePalette } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2(vUv.x * uAspect, vUv.y).scale(2.4);
    const n = warp2(p, uTime);
    const color = cosinePalette(
      n * 1.3 + 0.05,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1, 1, 1),
      vec3(0, 0.15, 0.35),
    );
    return vec4(color, 1);
  },
});
