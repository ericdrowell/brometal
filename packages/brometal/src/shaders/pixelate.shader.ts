import { shader, vec2, vec4, texture, floor, sin } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float', uTex: 'sampler2D' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect, uTex }, { vUv }) {
    const cells = 60 + floor(sin(uTime * 0.6) * 44);
    const q = vec2(floor(vUv.x * cells * uAspect) / (cells * uAspect), floor(vUv.y * cells) / cells);
    return texture(uTex, q);
  },
});
