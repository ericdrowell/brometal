import { shader, vec2, vec3, vec4, texture, sqrt } from 'brometal';
import { luminance } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float', uTex: 'sampler2D' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect, uTex }, { vUv }) {
    const e = 0.0016;
    const gx = luminance(texture(uTex, vUv.add(vec2(e, 0))).xyz) - luminance(texture(uTex, vUv.sub(vec2(e, 0))).xyz);
    const gy = luminance(texture(uTex, vUv.add(vec2(0, e))).xyz) - luminance(texture(uTex, vUv.sub(vec2(0, e))).xyz);
    const mag = sqrt(gx * gx + gy * gy) * 5;
    return vec4(mag * 0.4, mag * 0.9, mag, 1);
  },
});
