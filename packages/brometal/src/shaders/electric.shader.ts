import { shader, vec2, vec3, vec4, abs, floor, pow } from 'brometal';
import { fbm2, hash11 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const x = (vUv.x - 0.5) * uAspect;
    const flicker = 0.7 + 0.3 * hash11(floor(uTime * 14));
    const offset = (fbm2(vec2(vUv.y * 2.5 - uTime * 2.5, floor(uTime * 7)), 4) - 0.5) * 0.5;
    const d = abs(x - offset);
    const core = 0.006 / (d + 0.006);
    const glow = 0.04 / (d + 0.04);
    const bolt = pow(core, 1.5) * flicker;
    const halo = pow(glow, 2) * 0.5 * flicker;
    return vec4(bolt * 0.8 + halo * 0.4, bolt * 0.9 + halo * 0.5, bolt + halo, 1);
  },
});
