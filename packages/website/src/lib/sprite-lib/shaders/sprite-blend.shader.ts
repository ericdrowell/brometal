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
 * Kept alongside the cut-out shader so the two demos differ only in technique.
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
    v.vUv = iUvRect.xy.add(aUv.mul(iUvRect.zw));
    v.vTint = iTint;
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uAtlas }, { vUv, vTint }) {
    const texel = texture(uAtlas, vUv);
    return vec4(texel.xyz.mul(vTint.xyz), texel.w * vTint.w);
  },
});
