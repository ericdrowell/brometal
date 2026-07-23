import { shader, vec2, vec4, texture, length, sin } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float', uTex: 'sampler2D' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect, uTex }, { vUv }) {
    const c = vec2(vUv.x - 0.5, vUv.y - 0.5);
    const amount = length(c) * (0.012 + 0.008 * sin(uTime * 2));
    const dir = c.scale(amount * 6);
    const r = texture(uTex, vUv.add(dir)).x;
    const g = texture(uTex, vUv).y;
    const b = texture(uTex, vUv.sub(dir)).z;
    return vec4(r, g, b, 1);
  },
});
