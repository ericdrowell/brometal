import {
  shader,
  discard,
  floor,
  mix,
  mod,
  step,
  texture,
  vec3,
  vec4,
  type Vec3,
  type Vec4,
} from 'brometal';

// ── The one thing that still has to be uploaded every frame ────────────────
//
// Player physics and input are genuinely the CPU's job: the camera follows the
// player, the HUD counts its coins, and there is no way to read a result back off
// the GPU. So the app sends one vec4 — position, facing, and a state code — and
// the *presentation* of that state (which walk frame, which way the quad faces)
// is derived here. 16 bytes a frame, and the animation rule stops being JS.

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
  /** (X, Y, facing sign, state: 0 = airborne, 1 = idle, 2 = running). */
  instanceAttributes: { iState: 'vec4' },
  uniforms: {
    /** (camera X, camera Y, half view width, half view height). */
    uCamera: 'vec4',
    uAtlas: 'sampler2D',
    uCutoff: 'float',
    uAtlasGeom: 'vec4',
    uTime: 'float',
    /** (sprite size, Z, walk-cycle frames per second). */
    uPlayer: 'vec3',
    /** (idle tile, walk tile) — adjacent, which is what makes the cycle a mix(). */
    uFrames: 'vec2',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv, iState }, { uCamera, uAtlasGeom, uTime, uPlayer, uFrames }, v) {
    // Exactly one of these is 1. Airborne holds the walk frame for the whole
    // jump; running alternates; idle stands still.
    const airborne = 1 - step(0.5, iState.w);
    const running = step(1.5, iState.w);
    const cycle = mod(floor(uTime * uPlayer.z), 2);

    const tile = mix(uFrames.x, uFrames.y, airborne + running * cycle);
    const rect = tileRect(tile, uAtlasGeom);
    v.vUv = rect.xy.add(aUv.mul(rect.zw));

    // A negative width mirrors the quad without touching the UVs.
    const width = uPlayer.x * iState.z;
    return toClip(
      vec3(iState.x + aPosition.x * width, iState.y + aPosition.y * uPlayer.x, uPlayer.y),
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
