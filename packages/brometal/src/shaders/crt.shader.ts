import { shader, vec2, vec3, vec4, texture, dot, sin, smoothstep, step } from 'brometal';

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
    const r2 = dot(c, c);
    const q = vec2(c.x * (1 + r2 * 0.28) + 0.5, c.y * (1 + r2 * 0.28) + 0.5);
    const inBounds = step(0, q.x) * step(q.x, 1) * step(0, q.y) * step(q.y, 1);
    const scan = 0.82 + 0.18 * sin(q.y * 700 + uTime * 8);
    const flicker = 0.96 + 0.04 * sin(uTime * 60);
    const color = texture(uTex, q).xyz.scale(scan * flicker * inBounds);
    const vig = 1 - smoothstep(0.3, 0.62, r2);
    return vec4(color.scale(vig), 1);
  },
});
