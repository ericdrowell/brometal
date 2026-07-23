import { shader, vec2, vec3, vec4, texture, fract, length, mix } from 'brometal';
import { luminance, rotate2, fillAA } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float', uTex: 'sampler2D' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect, uTex }, { vUv }) {
    const lum = luminance(texture(uTex, vUv).xyz);
    const grid = rotate2(vec2(vUv.x * uAspect, vUv.y), 0.6).scale(70);
    const cell = vec2(fract(grid.x) - 0.5, fract(grid.y) - 0.5);
    const radius = (1 - lum) * 0.68;
    const ink = fillAA(length(cell) - radius, 0.08);
    const paper = vec3(0.96, 0.94, 0.88);
    const inkColor = vec3(0.12, 0.1, 0.2);
    return vec4(mix(paper, inkColor, ink), 1);
  },
});
