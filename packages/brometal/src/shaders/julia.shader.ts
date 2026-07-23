import { shader, vec2, vec3, vec4, sin, cos } from 'brometal';
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
    let zx = (vUv.x - 0.5) * uAspect * 2.8;
    let zy = (vUv.y - 0.5) * 2.8;
    const cRe = 0.7885 * cos(uTime * 0.25);
    const cIm = 0.7885 * sin(uTime * 0.25);
    let escaped = 0;
    for (let i = 1; i <= 48; i += 1) {
      const nx = zx * zx - zy * zy + cRe;
      const ny = 2 * zx * zy + cIm;
      zx = nx;
      zy = ny;
      if (escaped < 0.5 && zx * zx + zy * zy > 4) {
        escaped = i;
      }
    }
    let color = vec3(0, 0, 0);
    if (escaped > 0.5) {
      color = cosinePalette(escaped * 0.025 + uTime * 0.02, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1, 1, 1), vec3(0, 0.1, 0.2));
    }
    return vec4(color, 1);
  },
});
