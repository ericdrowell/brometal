import {
  shader,
  cos,
  discard,
  sin,
  step,
  texture,
  vec3,
  vec4,
  type Vec3,
  type Vec4,
} from 'brometal';

// ── Patrols that cost nothing per frame ────────────────────────────────────
//
// A walker's whole life is (from, to, y, speed, phase): a ping-pong along a
// segment, facing whichever way it is currently moving. That is uploaded once and
// evaluated here, so a walker turning around no longer re-uploads its size.
//
// The UV rect is baked into the instance rather than derived from a tile index,
// because a walker's tile genuinely never changes — static data belongs in the
// static upload.

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
    /** (from X, to X, Y, radians per second). */
    iPatrol: 'vec4',
    /** (phase, width, height, Z). */
    iTrait: 'vec4',
    iUvRect: 'vec4',
  },
  uniforms: {
    /** (camera X, camera Y, half view width, half view height). */
    uCamera: 'vec4',
    uAtlas: 'sampler2D',
    uCutoff: 'float',
    uTime: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv, iPatrol, iTrait, iUvRect }, { uCamera, uTime }, v) {
    const w = uTime * iPatrol.w + iTrait.x;
    const t = (sin(w) + 1) * 0.5;
    const cx = iPatrol.x + (iPatrol.y - iPatrol.x) * t;

    // step() rather than sign(): sign(cos w) is 0 at the turn-around instant,
    // which would collapse the quad to zero width for one frame. A negative
    // width mirrors the sprite and leaves the UVs alone.
    const facing = step(0, cos(w)) * 2 - 1;

    v.vUv = iUvRect.xy.add(aUv.mul(iUvRect.zw));
    return toClip(
      vec3(
        cx + aPosition.x * iTrait.y * facing,
        iPatrol.z + aPosition.y * iTrait.z,
        iTrait.w,
      ),
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
