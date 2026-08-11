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
 * Positions are in **tiles**, not pixels, with +y pointing down the screen the
 * way a tilemap is authored. The orthographic matrix on the CPU side does the
 * flip, so nothing here has to think about it.
 *
 * `iSize` does double duty: a sprite two tiles wide covers two tiles of world
 * and two cells of atlas. They are the same number because a cell is a tile, and
 * keeping it one attribute means a 2×2 tree cannot accidentally be authored as
 * a 2×2 quad showing a 1×1 crop.
 */
export const LegendOfBro = shader({
  attributes: { aCorner: 'vec2' },
  instanceAttributes: { iPos: 'vec2', iCell: 'vec2', iSize: 'vec2' },
  uniforms: { uViewProj: 'mat4', uCell: 'vec2', uAtlas: 'sampler2D' },
  varyings: { vUv: 'vec2' },

  vertex({ aCorner, iPos, iCell, iSize }, { uViewProj, uCell }, v) {
    const span = aCorner.mul(iSize);
    v.vUv = iCell.add(span).mul(uCell);
    const world = iPos.add(span);
    return uViewProj.mul(vec4(world.x, world.y, 0, 1));
  },

  fragment({ uAtlas }, { vUv }) {
    // Straight through: the atlas is pixel art sampled with a nearest filter, so
    // there is nothing to light and nothing to smooth. Transparent cells come
    // back with alpha 0 and the blend mode drops them.
    return texture(uAtlas, vUv);
  },
});
