import { shader, vec3, vec4, normalize, cross, clamp } from 'brometal';

/**
 * Laser bolts: long thin segments, animated entirely on the GPU from a birth
 * timestamp.
 *
 * Built like the warp streaks — a unit cube squashed to a sliver in x/y and
 * stretched along the flight direction — because that is what reads as a bolt of
 * light at speed. The previous version stretched a sphere, which stayed too fat
 * to look like anything but a blob.
 *
 * The segment is anchored at its **tail**, not its centre: `aPosition.z + 0.5`
 * maps the cube's [-0.5, 0.5] onto [0, 1], so the bolt occupies the length
 * *ahead* of its spawn point. Centring it put half the segment behind the
 * muzzle, which at spawn reads as the ship firing backwards through itself.
 */
export default shader({
  attributes: { aPosition: 'vec3' },
  instanceAttributes: { iStart: 'vec3', iDir: 'vec3', iBirth: 'float' },
  uniforms: {
    uViewProj: 'mat4',
    uTime: 'float',
    uColor: 'vec3',
    /**
     * Speed and lifetime come from the CPU rather than being written here,
     * because the same numbers place each bolt's light for the asteroids. Baked
     * in twice they would drift apart and the glow would trail the shot.
     */
    uSpeed: 'float',
    uLife: 'float',
  },
  varyings: { vAlong: 'float', vFade: 'float' },

  vertex(
    { aPosition, iStart, iDir, iBirth },
    { uViewProj, uTime, uSpeed, uLife },
    v,
  ) {
    const age = uTime - iBirth;
    const alive = clamp(age * 60, 0, 1) * clamp((uLife - age) * 4, 0, 1);

    const f = normalize(iDir);
    // (rgt, up, f) must stay right-handed — a flipped basis mirrors the
    // winding order and backface culling removes the whole bolt.
    const rgt = normalize(cross(f, vec3(0, 1, 0)));
    const up = cross(f, rgt);

    const width = 0.05 * alive;
    // 0 at the tail, 1 at the tip: the bolt extends forward out of the muzzle.
    const along = aPosition.z + 0.5;
    const local = rgt
      .scale(aPosition.x * width)
      .add(up.scale(aPosition.y * width))
      .add(f.scale(along * 4.5));

    const world = iStart.add(f.scale(age * uSpeed)).add(local);
    v.vAlong = along;
    v.vFade = alive;
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uColor }, { vAlong, vFade }) {
    // Brightest at the tip and trailing off toward the tail, so the segment
    // reads as travelling rather than as a static bar.
    const head = vAlong * vAlong;
    return vec4(uColor.add(vec3(1, 1, 1).scale(head * 0.8)), (0.25 + head) * vFade);
  },
});
