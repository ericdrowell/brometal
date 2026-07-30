import {
  shader,
  abs,
  discard,
  floor,
  max,
  mix,
  mod,
  sin,
  step,
  texture,
  vec2,
  vec3,
  vec4,
  type Vec2,
  type Vec4,
} from 'brometal';

// ── A tilemap scene that the CPU only has to describe once ──────────────────
//
// The whole dungeon — floor, walls, props, torch flames, patrolling monsters,
// the hero — is one instanced draw whose instance buffer is uploaded at load
// and never touched again. Per frame the app sends a camera, a clock and the
// hero's position, and nothing else crosses the bus.
//
// Everything that used to be baked into instance attributes every frame is
// derived here instead:
//   * which tile stands in a cell     -> a 46x34 byte texture (uMap)
//   * how lit a sprite is             -> a 46x34 byte texture (uLight)
//   * where a monster is              -> a closed form in uTime
//   * the UV rect of a tile index     -> atlasRect()
//
// ## Two things this stage deliberately does NOT do
//
// It does not draw empty cells and cull them with `clip = vec4(2,2,2,1)`. That
// trick is real and this repo leans on it elsewhere (brocraft-blocks), but
// clipping happens *after* the vertex shader: a degenerate clip position saves
// rasterization and nothing else, so 797 empty slots would still have run this
// whole stage every frame. Which cells are occupied is fixed at load, so the app
// compacts the list once instead and all 802 instances draw something.
// Self-culling earns its keep when visibility changes per frame.
//
// And it does not loop over the torches. Summing nine of them per vertex cost
// nine texture fetches and eighteen sin() per vertex — ~64,000 fetches and
// ~141,000 sin a frame — to evaluate a field that does not move. uLight is that
// field, baked: distance to the nearest torch in one byte, which torch in
// another. The whole draw is now 6,416 vertex fetches and 12,832 sin.
//
// Be straight about the trade, though. The CPU pass that predates all of this
// did 6,903 falloff evaluations and 18 sin a frame. This does 3,208 falloff
// evaluations (one per vertex) and 12,832 sin, because flicker is a function of
// time alone and a per-vertex program has nowhere to hoist it to. So it is not
// cheaper arithmetic; what it buys is that no lighting result crosses the bus and
// no JS ever walks the level — 41 KiB a frame and a full pass over the map, gone.
//
// ## Instance lanes
//
// Roles share two vec4s, so the lanes mean different things per role. Written
// out because `pose`, the map fetch and patrolPose() are computed for *every*
// instance and are simply meaningless (not wrong — weighted to zero) for the
// roles that do not use them:
//
//   iSlot.z = role: 0 terrain, 1 prop, 2 torch flame, 3 monster, 4 hero
//   iSlot.xy  roles 0/1/2: the integer grid cell the sprite sits on
//             role 3:      (patrol speed in world units/s, unused)
//             role 4:      unused — the hero's position is a uniform
//   iSlot.w   the atlas tile index; unused for role 0, which reads the map
//   iRect     role 3: the patrol rectangle (x0, y0, x1, y1); otherwise zero

/** A data-texture channel arrives as 0..1; recover the byte the CPU wrote. */
function byteOf(channel: number): number {
  return floor(channel * 255 + 0.5);
}

/**
 * The UV rect (origin, extent) of `tile` in a `grid`-tiled atlas — the GPU twin
 * of `spriteAtlas().rect()` in sprites.ts, which stays the canonical copy. Keep
 * the two in step: this one exists so a static instance buffer never has to
 * carry UVs at all.
 *
 * V is flipped because `loadTexture` defaults to `flipY: true`, so image row 0
 * lands at the top of the texture. `inset` is half a *texel*: Kenney's packed
 * atlases have no gutter, so an edge-to-edge rect samples exactly on the
 * boundary between two tiles and picks up the neighbour along the seam.
 */
function atlasRect(tile: number, grid: Vec2, inset: Vec2): Vec4 {
  const du = 1 / grid.x;
  const dv = 1 / grid.y;
  const col = mod(tile, grid.x);
  const row = floor(tile / grid.x);
  return vec4(col * du + inset.x, 1 - (row + 1) * dv + inset.y, du - inset.x * 2, dv - inset.y * 2);
}

/**
 * One torch's brightness at time `t`, seeded by the torch's index.
 *
 * The index reaches this function two ways — a flame sprite reads it out of
 * uLight at its own cell, and so does every floor tile in that torch's pool —
 * so a flame and the light it casts agree by construction rather than by two
 * expressions being kept in step by hand.
 *
 * These sin arguments grow without bound with uptime: the fastest is t * 20.6,
 * which passes 16,000 rad after ~13 minutes, where f32 sin is
 * implementation-defined and the two backends will drift apart. That is fine
 * *here* because the output is noise — nobody can tell one flicker sequence from
 * another. It would not be fine for anything the eye can latch onto, which is
 * why the tile index in uMap is a baked byte and not hash21(cell): a hash that
 * diverges picks a visibly different sprite, on one backend only.
 */
function torchFlicker(index: number, t: number): number {
  return 0.78 + 0.22 * sin(t * (7 + index * 1.7) + index * 2.1) * sin(t * 3.1 + index);
}

/**
 * Where a monster is at time `t`, walking `rect`'s perimeter at `speed`.
 *
 * The CPU version integrated toward the next waypoint each frame, so its
 * position was state and had to be re-uploaded. A patrol loop is periodic, so
 * it has a closed form: nothing to store, nothing to step, and JS can evaluate
 * the same expression for any monster it later wants to test against the hero.
 *
 * Four edges become four weights rather than four branches. Returns
 * (x, drawn y, facing, depth y) — the drawn y hops, the depth y does not.
 */
function patrolPose(rect: Vec4, speed: number, t: number): Vec4 {
  const lx = rect.z - rect.x;
  const ly = rect.w - rect.y;
  // Every non-monster instance carries a zeroed rect, and this runs for all of
  // them. Without a floor on the period mod() divides by zero, and the NaN
  // survives the mix() that was supposed to weight this result away.
  const s = mod(t * speed, max((lx + ly) * 2, 1));
  const e0 = 1 - step(lx, s);
  const e1 = step(lx, s) - step(lx + ly, s);
  const e2 = step(lx + ly, s) - step(lx * 2 + ly, s);
  const e3 = step(lx * 2 + ly, s);
  const x = e0 * (rect.x + s) + e1 * rect.z + e2 * (rect.z - (s - lx - ly)) + e3 * rect.x;
  const y = e0 * rect.y + e1 * (rect.y + s - lx) + e2 * rect.w + e3 * (rect.w - (s - lx * 2 - ly));
  // A hop is the whole animation — Tiny Dungeon has one frame per character —
  // and the sprite only faces left on the one edge that walks leftward.
  return vec4(x, y + abs(sin(t * 6 + x)) * 0.09, mix(1, -1, e2), y);
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  instanceAttributes: { iSlot: 'vec4', iRect: 'vec4' },
  uniforms: {
    uViewProj: 'mat4',
    /** R = kind (1 floor, 2 wall), G = atlas tile index. */
    uMap: 'sampler2D',
    uMapSize: 'vec2',
    /**
     * The torchlight field, baked once. R = distance to the nearest torch as a
     * fraction of that torch's reach, so the shader never learns where the
     * torches are or how far they throw. G = which torch, for its flicker.
     */
    uLight: 'sampler2D',
    uAtlas: 'sampler2D',
    uAtlasGrid: 'vec2',
    uAtlasInset: 'vec2',
    // The two loose floats are declared together on purpose. WebGPU lays this
    // block out std140-style in declaration order, and a float wedged between
    // two vec4s is rounded up to sixteen bytes; side by side they share one slot
    // and the whole block is 128 bytes instead of 160.
    uTime: 'float',
    uCutoff: 'float',
    /** (floor, decor, item, actor) from LAYER in sprites.ts — one copy, passed in. */
    uLayers: 'vec4',
    /** (x, y, facing, walking) — the only gameplay state the CPU still owns. */
    uHero: 'vec4',
  },
  varyings: { vUv: 'vec2', vTint: 'vec4' },

  vertex(
    { aPosition, aUv, iSlot, iRect },
    { uViewProj, uMap, uMapSize, uLight, uAtlasGrid, uAtlasInset, uLayers, uTime, uHero },
    v,
  ) {
    // Role dispatch as a weight vector: exactly one of these is 1. The DSL has
    // no enum and no integers, and weights keep the texture fetches out of any
    // per-instance branch — the same trick brocraft-blocks uses to pick a
    // material.
    //
    // The two actor poses below are therefore evaluated for all 802 instances,
    // and only 9 of them use one. A branch on role would be legal — it contains
    // no texture() and so does not break WGSL's uniformity rule — but each body
    // is about twenty ALU ops and a sine, small enough that a warp straddling the
    // terrain/actor boundary plausibly pays as much in divergence as the skip
    // saves, and the weighted form keeps the NaN floor in patrolPose() and the
    // mix() chain in one readable place.
    const role = iSlot.z;
    const wTerrain = 1 - step(0.5, role);
    const wProp = step(0.5, role) - step(1.5, role);
    const wFlame = step(1.5, role) - step(2.5, role);
    const wMonster = step(2.5, role) - step(3.5, role);
    const wHero = step(3.5, role);
    const wActor = step(2.5, role);

    // Actor poses are derived, not uploaded.
    const walk = patrolPose(iRect, iSlot.x, uTime);
    const heroY = uHero.y + abs(sin(uTime * 11)) * 0.12 * uHero.w;

    // xy = where the sprite is drawn, z = the y that feeds depth. They differ
    // for actors: sorting on the *hopped* y makes a monster flicker in front of
    // and behind its neighbours on every bounce.
    let pose = vec3(iSlot.x + 0.5, iSlot.y + 0.5, iSlot.y + 0.5);
    pose = mix(pose, vec3(walk.x, walk.y, walk.w), wMonster);
    pose = mix(pose, vec3(uHero.x, heroY, uHero.y), wHero);

    let facing = mix(1, walk.z, wMonster);
    facing = mix(facing, uHero.z, wHero);

    // One UV serves both level textures. Dividing a world position by the map
    // size lands mid-texel for terrain (pose is cell + 0.5) and, with nearest
    // filtering, in the containing cell for an actor standing anywhere — so a
    // monster is lit by the same value as the floor tile it is standing on.
    //
    // pose.z, not pose.y: the cell a sprite occupies is the one its feet are in,
    // not the one a hop lifted it into. Using the bobbed y here makes an actor
    // near a cell boundary strobe between two brightnesses at the bob's own 11 Hz.
    const uv = vec2(pose.x, pose.z).div(uMapSize);
    const map = texture(uMap, uv);
    const lit = texture(uLight, uv);
    const kind = byteOf(map.x);

    // Torchlight: one fetch, one flicker, no loop and no torch positions.
    // The distance byte arrives already normalised to the torch's reach, so
    // falloff is a parabola in it, squared again for a soft-edged pool. Nearest
    // torch only, which is why nothing needs clamping afterwards: falloff peaks
    // at 1 and flicker peaks at 1, so light peaks at ambient + torch colour.
    const fall = max(1 - lit.x * lit.x, 0);
    const flick = torchFlicker(byteOf(lit.y), uTime);
    const light = vec3(0.3, 0.29, 0.4).add(vec3(0.85, 0.5, 0.2).scale(fall * fall * flick));

    // A flame is emissive, so it takes no light; everything else multiplies its
    // flat albedo by the light it stands in.
    const albedo = vec3(1, 1, 1)
      .scale(wTerrain + wHero)
      .add(vec3(0.95, 0.92, 0.88).scale(wProp))
      .add(vec3(0.95, 0.95, 1).scale(wMonster));
    const flame = vec3(1, 0.85 + flick * 0.15, 0.6 + flick * 0.2);
    v.vTint = vec4(light.mul(albedo).add(flame.scale(wFlame)), 1);

    const tile = mix(byteOf(map.y), iSlot.w, step(0.5, role));
    // One call, one const: the helper hides a divide and a mod and the compiler
    // makes no promise about common subexpressions.
    const rect = atlasRect(tile, uAtlasGrid, uAtlasInset);
    v.vUv = rect.xy.add(aUv.mul(rect.zw));

    // Layering is a Z, not a submission order. The four layer values arrive in
    // uLayers so LAYER in sprites.ts stays the only copy of the table; the two
    // offsets below are derived, not table entries. Actors share the actor layer
    // and are separated inside it by Y, which is classic y-sorting for free —
    // 0.05 keeps that band well clear of LAYER.overhead above it.
    const actorZ = uLayers.w + (1 - pose.z / uMapSize.y) * 0.05;
    const z =
      wTerrain * mix(uLayers.x, uLayers.y, step(1.5, kind)) +
      wProp * uLayers.z +
      // A flame hangs on the wall it is drawn over, so it needs the wall's layer
      // plus the smallest nudge that wins the depth test.
      wFlame * (uLayers.y + 0.01) +
      wActor * actorZ;

    // A negative x scale mirrors the quad without touching the UVs, which is
    // how facing left costs nothing.
    const world = vec3(pose.x + aPosition.x * facing, pose.y + aPosition.y, z);
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
