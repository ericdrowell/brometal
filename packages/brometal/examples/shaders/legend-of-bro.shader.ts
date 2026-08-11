import { shader, vec4, texture } from 'brometal';

/**
 * Every visible thing in Legend of Bro: one instanced quad, sampled from one
 * atlas.
 *
 * Ground tiles, trees, the hero and the monsters are the same draw — they differ
 * only in which atlas cell they read and where they sit. That is the whole point
 * of the example: a 2D game's renderer is not a pile of special cases, it is one
 * quad submitted a few thousand times.
 *
 * Positions are in **art pixels**, with +y pointing down the screen the way a
 * tilemap is authored. The orthographic matrix on the CPU side does the flip,
 * so nothing here has to think about it.
 *
 * Pixels rather than tiles because the scene renders into a target sized in art
 * pixels, one texel per pixel, which is what makes the result pixel-perfect. The
 * CPU rounds every position to a whole pixel before it gets here; a sprite at
 * x = 40.3 would land between texels and shimmer as it moved.
 *
 * `iSize` stays in **cells**, since it also picks how much of the atlas to read:
 * a 2×2 tree is two cells wide there and thirty-two pixels wide in the world.
 * One attribute for both means a 2×2 quad cannot accidentally be authored
 * showing a 1×1 crop.
 */
export const LegendOfBro = shader({
  attributes: { aCorner: 'vec2' },
  instanceAttributes: { iPos: 'vec2', iCell: 'vec2', iSize: 'vec2' },
  uniforms: { uViewProj: 'mat4', uCell: 'vec2', uTile: 'float', uAtlas: 'sampler2D' },
  varyings: { vUv: 'vec2' },

  vertex({ aCorner, iPos, iCell, iSize }, { uViewProj, uCell, uTile }, v) {
    const span = aCorner.mul(iSize);
    v.vUv = iCell.add(span).mul(uCell);
    const world = iPos.add(span.scale(uTile));
    return uViewProj.mul(vec4(world.x, world.y, 0, 1));
  },

  fragment({ uAtlas }, { vUv }) {
    // Straight through: the atlas is pixel art sampled with a nearest filter, so
    // there is nothing to light and nothing to smooth. Transparent cells come
    // back with alpha 0 and the blend mode drops them.
    return texture(uAtlas, vUv);
  },
});
