import { shader, vec2, vec4, floor, min, storageRead, storageLength } from 'brometal';

/** Reads the compute shader's output back and paints it across the screen. */
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
    // A stripe across the bottom reports arrayLength, so a buffer that bound at
    // the wrong size is visible too.
    const lengthOk = storageLength(uData) / uCount;
    return vec4(value.x, value.y * lengthOk, value.z, 1);
  },
});
