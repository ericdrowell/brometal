import { shader, texture, vec4 } from 'brometal';

/**
 * The same sprite quads as sprite-cutout, drawn the way BroMetal could draw
 * them before `discard()` existed: alpha is written straight out and the
 * program blends it.
 *
 * Blended programs default to `depthWrite: false` — a half-transparent fragment
 * has no single depth to record — so nothing here orders the sprites. The
 * caller has to sort them back-to-front on the CPU every frame, and sprites
 * that intersect still resolve per-sprite instead of per-pixel.
 *
 * Kept alongside the cut-out shader so the two demos differ only in technique,
 * and the pair is meant to be read as a diff. The vertex stages of the two
 * files are identical text, down to the comments; everything that differs is
 * the fragment stage — the `discard()` test and the alpha channel of the return
 * — plus the `uCutoff` uniform that test needs and the `discard` import. Keep
 * it that way. SpriteCompareDemo's header records which otherwise-good
 * optimisations that invariant rules out, and the arithmetic behind refusing
 * them; it lives there so this file stays short enough to diff by eye.
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

  fragment({ uAtlas }, { vUv, vTint }) {
    const texel = texture(uAtlas, vUv);
    return vec4(texel.xyz.mul(vTint.xyz), texel.w * vTint.w);
  },
});
