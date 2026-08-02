import { shader, vec2, vec4, floor, min, storageRead, storageLength } from 'brometal';

/** Fixture: paints a storage buffer across the canvas so pixels can be asserted. */
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uCount: 'float' },
  storage: { uData: 'vec4' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment({ uData, uCount }, { vUv }) {
    const index = min(floor(vUv.x * uCount), uCount - 1);
    const value = storageRead(uData, index);
    // Alpha carries arrayLength/uCount so a buffer bound at the wrong size shows
    // up as a channel that is not exactly 1.
    return vec4(value.x, value.y, value.z, storageLength(uData) / uCount);
  },
});
