import { shader, discard, texture, vec3, vec4, length } from 'brometal';

/**
 * The cut-out sprite shader from the 2D demos, with one change: alpha carries
 * camera distance instead of coverage, so billboards land in the same float
 * target as the 3D scene and the depth-of-field pass treats them identically.
 *
 * That only works *because* the sprites are cut-out. A blended sprite would need
 * alpha for coverage and could not report its depth at all — which is the same
 * reason it could not write to the depth buffer either.
 */
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  instanceAttributes: { iCenter: 'vec3', iSize: 'vec2', iUvRect: 'vec4', iTint: 'vec4' },
  uniforms: {
    uViewProj: 'mat4',
    uRight: 'vec3',
    uUp: 'vec3',
    uCamPos: 'vec3',
    uAtlas: 'sampler2D',
    uCutoff: 'float',
  },
  varyings: { vUv: 'vec2', vTint: 'vec4', vDepth: 'float' },

  vertex(
    { aPosition, aUv, iCenter, iSize, iUvRect, iTint },
    { uViewProj, uRight, uUp, uCamPos },
    v,
  ) {
    const world = iCenter
      .add(uRight.scale(aPosition.x * iSize.x))
      .add(uUp.scale(aPosition.y * iSize.y));
    v.vUv = iUvRect.xy.add(aUv.mul(iUvRect.zw));
    v.vTint = iTint;
    v.vDepth = length(world.sub(uCamPos));
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uAtlas, uCutoff }, { vUv, vTint, vDepth }) {
    const texel = texture(uAtlas, vUv);
    if (texel.w * vTint.w < uCutoff) {
      discard();
    }
    const lit = vec3(texel.x, texel.y, texel.z).mul(vec3(vTint.x, vTint.y, vTint.z));
    return vec4(lit, vDepth);
  },
});
