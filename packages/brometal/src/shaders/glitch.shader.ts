import { shader, vec2, vec4, texture, floor, fract, step } from 'brometal';
import { hash11 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float', uTex: 'sampler2D' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect, uTex }, { vUv }) {
    const frame = floor(uTime * 7);
    const row = floor(vUv.y * 28);
    const gate = step(0.82, hash11(row * 3.7 + frame * 17));
    const shift = (hash11(row + frame * 100) - 0.5) * 0.25 * gate;
    const q = vec2(fract(vUv.x + shift), vUv.y);
    const split = 0.012 * gate + 0.002;
    const r = texture(uTex, vec2(fract(q.x + split), q.y)).x;
    const g = texture(uTex, q).y;
    const b = texture(uTex, vec2(fract(q.x - split), q.y)).z;
    return vec4(r, g, b, 1);
  },
});
