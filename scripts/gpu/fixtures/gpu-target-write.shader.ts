import { shader, vec4 } from 'brometal';

/** Fixture: paints its uv into a render target so the round trip can be checked. */
export const GpuTargetWrite = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uMark: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment({ uMark }, { vUv }) {
    // Blue is a constant the read pass looks for: a target that was never drawn
    // into reads back as the clear colour, which would pass a uv check by luck.
    return vec4(vUv.x, vUv.y, uMark, 1);
  },
});
