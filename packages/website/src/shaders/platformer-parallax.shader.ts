import {
  shader,
  abs,
  discard,
  floor,
  mix,
  mod,
  texture,
  vec3,
  vec4,
  type Vec3,
  type Vec4,
} from 'brometal';

// ── A scrolling backdrop from a buffer that never changes ──────────────────
//
// The strips the CPU used to window and push each frame are a fixed set of
// slots here. Which world strip a slot lands on is worked out in the vertex
// shader from the camera, so the app writes two floats instead of rebuilding a
// dozen sprites.

/** `spriteAtlas.rect` transcribed. `geom` is (cols, rows, insetU, insetV). */
function tileRect(tile: number, geom: Vec4): Vec4 {
  const du = 1 / geom.x;
  const dv = 1 / geom.y;
  const col = mod(tile, geom.x);
  const row = floor(tile / geom.x);
  return vec4(
    col * du + geom.z,
    1 - (row + 1) * dv + geom.w,
    du - geom.z * 2,
    dv - geom.w * 2,
  );
}

/**
 * The 2D camera without a matrix — see `platformer-terrain.shader.ts` for why.
 * `cam` is (centre X, centre Y, half view width, half view height).
 */
function toClip(world: Vec3, cam: Vec4): Vec4 {
  return vec4((world.x - cam.x) / cam.z, (world.y - cam.y) / cam.w, -world.z, 1);
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  /** (slot 0..slots-1, tier: 0 = horizon band, 1 = haze below it). */
  instanceAttributes: { iSlot: 'vec2' },
  uniforms: {
    uAtlas: 'sampler2D',
    uCutoff: 'float',
    uAtlasGeom: 'vec4',
    /**
     * (camera X, camera Y, half view width, half view height). The backdrop is
     * the one thing here that needs more of the camera than the projection: the
     * strip lattice is positioned from the camera's X and the view's width.
     */
    uCamera: 'vec4',
    /** (strip size, band centre Y, parallax factor, Z). */
    uBand: 'vec4',
    /** (band run base, band run length, haze fill tile). */
    uTiles: 'vec3',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv, iSlot }, { uAtlasGeom, uCamera, uBand, uTiles }, v) {
    const band = uBand.x;
    // The backdrop keeps only a fraction of the camera's motion, so in the
    // camera's own frame it slides the other way; `anchor` is where the strip
    // lattice sits relative to the view.
    const drift = uCamera.x * uBand.z;
    const anchor = uCamera.x - drift;
    // One strip to the left of the view edge, so the partially visible one is
    // still drawn. Slots past the right edge simply land off-screen and are
    // clipped — cheaper than deriving an instance count from the aspect ratio,
    // and `draw()` throws rather than clamping if that count is ever too big.
    const first = floor((anchor - uCamera.z) / band) - 1;
    const strip = first + iSlot.x;
    const tier = iSlot.y;

    // BACKGROUND_TILES.band is a contiguous run, so cycling through its four
    // variants is arithmetic. abs() first: mod() disagrees between GLSL and WGSL
    // on negative operands, and strip indices go negative at the level's start.
    const tile = mix(uTiles.x + mod(abs(strip), uTiles.y), uTiles.z, tier);
    const rect = tileRect(tile, uAtlasGeom);
    v.vUv = rect.xy.add(aUv.mul(rect.zw));

    const cx = strip * band + drift;
    const cy = uBand.y - band * tier;
    return toClip(
      vec3(cx + aPosition.x * band, cy + aPosition.y * band, uBand.w),
      uCamera,
    );
  },

  fragment({ uAtlas, uCutoff }, { vUv }) {
    const texel = texture(uAtlas, vUv);
    if (texel.w < uCutoff) {
      discard();
    }
    return vec4(texel.xyz, 1);
  },
});
