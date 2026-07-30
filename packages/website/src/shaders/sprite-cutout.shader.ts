import { shader, discard, texture, vec4 } from 'brometal';

/**
 * Cut-out sprite quads. One instance per sprite; the quad is expanded in the
 * vertex shader along whatever axes `uRight`/`uUp` name, so the same shader
 * draws camera-facing billboards, upright 2.3D billboards, ground-plane tiles,
 * and flat 2D sprites — only the two basis uniforms change between draws.
 *
 * The fragment stage discards anything below `uCutoff` instead of blending it.
 * Every surviving fragment is fully opaque, so the program can write depth and
 * the GPU sorts the sprites — no CPU sort, and sprites that intersect each
 * other or the 3D world resolve per pixel.
 *
 * The vertex stage below is identical text to sprite-blend's, deliberately: the
 * pair is read as a diff, so the difference between the files should stay
 * confined to the fragment stage plus what it needs (`uCutoff`, `discard`). See
 * the note in that file.
 */
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  instanceAttributes: {
    iCenter: 'vec3',
    iSize: 'vec2',
    iUvRect: 'vec4',
    iTint: 'vec4',
  },
  uniforms: {
    uViewProj: 'mat4',
    uRight: 'vec3',
    uUp: 'vec3',
    uAtlas: 'sampler2D',
    uCutoff: 'float',
  },
  varyings: { vUv: 'vec2', vTint: 'vec4' },

  vertex({ aPosition, aUv, iCenter, iSize, iUvRect, iTint }, { uViewProj, uRight, uUp }, v) {
    const world = iCenter
      .add(uRight.scale(aPosition.x * iSize.x))
      .add(uUp.scale(aPosition.y * iSize.y));
    // xy = atlas origin, zw = atlas extent. A negative iSize.x mirrors the quad
    // without touching the UVs, which is how flipX costs nothing.
    v.vUv = iUvRect.xy.add(aUv.mul(iUvRect.zw));
    v.vTint = iTint;
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uAtlas, uCutoff }, { vUv, vTint }) {
    const texel = texture(uAtlas, vUv);
    if (texel.w * vTint.w < uCutoff) {
      discard();
    }
    return vec4(texel.xyz.mul(vTint.xyz), 1);
  },
});
