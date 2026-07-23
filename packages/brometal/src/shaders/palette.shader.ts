import { shader, vec2, vec3, vec4, sin } from 'brometal';
import { cosinePalette } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const wave = 0.15 * sin(vUv.y * 8 + uTime);
    const color = cosinePalette(
      vUv.x * uAspect * 0.55 + wave + uTime * 0.1,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1, 1, 1),
      vec3(0, 0.33, 0.67),
    );
    return vec4(color, 1);
  },
});
