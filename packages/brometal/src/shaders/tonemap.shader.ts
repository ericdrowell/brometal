import { shader, vec2, vec3, vec4, abs, mix } from 'brometal';
import { fbm2, tonemapACES, gammaCorrect } from 'brometal/shader-functions';

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
    const n = fbm2(p.add(vec2(uTime * 0.2, 0)), 5);
    const hdr = vec3(n * 3.2, n * n * 2.4, n * 0.9);
    let color = hdr;
    if (vUv.x > 0.5) {
      color = gammaCorrect(tonemapACES(hdr), 2.2);
    }
    let divider = 0;
    if (abs(vUv.x - 0.5) < 0.002) {
      divider = 1;
    }
    return vec4(mix(color, vec3(1, 1, 1), divider), 1);
  },
});
