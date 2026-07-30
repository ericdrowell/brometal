import {
  shader,
  discard,
  floor,
  mix,
  mod,
  sin,
  texture,
  vec3,
  vec4,
  type Vec3,
  type Vec4,
} from 'brometal';

// ── Props that animate without being re-uploaded ───────────────────────────
//
// Coins and the flag are placed once and never move again as far as the app is
// concerned. The bob and the flag's two-frame flip are functions of uTime, so the
// only thing that ever travels to the GPU after startup is `iAlive` — and only on
// the frames a coin is actually picked up, because whether a coin still exists is
// gameplay the CPU has to know (it is on the HUD) and there is no readback.

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
  instanceAttributes: {
    iCenter: 'vec3',
    /** (tile, width, height, isFlag). */
    iStamp: 'vec4',
    /** 1 while the prop is still in the world. Re-uploaded only on a pickup. */
    iAlive: 'float',
  },
  uniforms: {
    /** (camera X, camera Y, half view width, half view height). */
    uCamera: 'vec4',
    uAtlas: 'sampler2D',
    uCutoff: 'float',
    uAtlasGeom: 'vec4',
    uTime: 'float',
    /** (bob rate, bob amplitude). */
    uBob: 'vec2',
    /** (first flag tile, flips per second, frame count). */
    uFlag: 'vec3',
    /** Coins read a touch brighter than the world they sit in. */
    uCoinTint: 'vec3',
  },
  varyings: { vUv: 'vec2', vTint: 'vec3' },

  vertex(
    { aPosition, aUv, iCenter, iStamp, iAlive },
    { uCamera, uAtlasGeom, uTime, uBob, uFlag, uCoinTint },
    v,
  ) {
    const isFlag = iStamp.w;
    // Phase offset by world X so a row of coins ripples instead of pulsing in
    // lockstep — the same thing the CPU loop did with `sin(t * 3.4 + coin.x)`.
    const bob = sin(uTime * uBob.x + iCenter.x) * uBob.y * (1 - isFlag);

    // flagA and flagB are adjacent tiles, so the flip is mod() on a frame
    // counter rather than a table the DSL could not hold anyway.
    const tile = mix(iStamp.x, uFlag.x + mod(floor(uTime * uFlag.y), uFlag.z), isFlag);
    const rect = tileRect(tile, uAtlasGeom);
    v.vUv = rect.xy.add(aUv.mul(rect.zw));
    v.vTint = mix(uCoinTint, vec3(1, 1, 1), isFlag);

    let clip = toClip(
      vec3(
        iCenter.x + aPosition.x * iStamp.y,
        iCenter.y + bob + aPosition.y * iStamp.z,
        iCenter.z,
      ),
      uCamera,
    );
    if (iAlive < 0.5) {
      clip = vec4(2, 2, 2, 1);
    }
    return clip;
  },

  fragment({ uAtlas, uCutoff }, { vUv, vTint }) {
    const texel = texture(uAtlas, vUv);
    if (texel.w < uCutoff) {
      discard();
    }
    return vec4(texel.xyz.mul(vTint), 1);
  },
});
