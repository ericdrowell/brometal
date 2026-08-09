import {
  shader,
  vec2,
  vec3,
  vec4,
  length,
  dot,
  texture,
  max,
  min,
  sqrt,
  step,
  mix,
  clamp,
} from 'brometal';
import {
  integrateVelocity,
  separateSpheres,
  applyDrag,
  bounceVelocity,
  applyFriction,
  restingDamp,
  boxContactNormal,
  clampInsideBox,
  collisionImpulse,
} from 'brometal/shader-functions';

/**
 * One simulation step, run as a fragment pass over the state target.
 *
 * State is laid out along X only: the left half holds positions, the right half
 * velocities. Rows are the axis where writing and reading disagree — a
 * fullscreen quad's NDC +y covers the target's first row, while texture v
 * addresses that row as v = 0 — so a two-row layout would silently swap position
 * and velocity. U has no such asymmetry.
 *
 * Balls are never allowed to overlap, rather than being pushed apart afterwards.
 * A step works out where the ball wants to go, then asks every neighbour how far
 * along that path it may travel before touching, and takes the smallest answer.
 * Since no ball is ever inside another there is no penetration to unwind — which
 * is what otherwise shows up as a settled pile slowly inflating for seconds.
 *
 * Contacts are resolved by masking rather than branching: `textureSample` may
 * only be called from uniform control flow in WGSL, so every ball samples every
 * other unconditionally and multiplies the result away when it does not apply.
 */
export const BallsPhysics = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: {
    uState: 'sampler2D',
    uCount: 'float',
    uDt: 'float',
    uGravity: 'vec3',
    uBounds: 'vec3',
    uRadius: 'float',
    uRestitution: 'float',
    uFriction: 'float',
    uDrag: 'float',
    uSleep: 'float',
    uSkin: 'float',
    uBounceCut: 'float',
    uRepair: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment(
    {
      uState,
      uCount,
      uDt,
      uGravity,
      uBounds,
      uRadius,
      uRestitution,
      uFriction,
      uDrag,
      uSleep,
      uSkin,
      uBounceCut,
      uRepair,
    },
    { vUv },
  ) {
    const isVelocity = step(0.5, vUv.x);
    const slot = vUv.x - isVelocity * 0.5;
    const pos = texture(uState, vec2(slot, 0.5)).xyz;
    const vel = texture(uState, vec2(slot + 0.5, 0.5)).xyz;

    const free = applyDrag(integrateVelocity(vel, uGravity, uDt), uDrag, uDt);
    const diameter = uRadius * 2;

    // ── What the contacts do to velocity ──────────────────────────────────
    let push = vec3(0, 0, 0);
    let repair = vec3(0, 0, 0);
    let touching = 0;
    let support = 0;
    for (let k = 0; k < uCount; k += 1) {
      const u = ((k + 0.5) / uCount) * 0.5;
      const otherPos = texture(uState, vec2(u, 0.5)).xyz;
      const otherVel = texture(uState, vec2(u + 0.5, 0.5)).xyz;
      const delta = pos.sub(otherPos);
      const dist = length(delta);
      // Zero distance is this ball meeting itself; beyond a diameter plus the
      // contact skin is not touching. Both collapse the contribution away.
      const isSelf = step(dist, 0.0001);
      const contact = step(dist, diameter + uSkin) * (1 - isSelf);
      const dir = delta.scale(1 / max(dist, 0.0001));
      // Restitution is dropped below a threshold closing speed: a contact that
      // is merely settling should not bounce, and letting it keeps a pile
      // trembling on micro-bounces that never quite die out.
      const approach = dot(free.sub(otherVel), dir);
      const bounce = uRestitution * step(uBounceCut, -approach);
      const impulse = collisionImpulse(free.sub(otherVel), dir, 1, 1, bounce);
      push = push.add(dir.scale(impulse * contact));
      touching += contact;
      // Swept motion stops a ball entering a neighbour, but two balls closing
      // on each other each get clearance against the other's *old* position,
      // and the wall clamp can shove one into another. Those leaks are rare and
      // shallow, so a gentle push repairs them before they can accumulate —
      // and being tiny, it never reads as the pile decompressing.
      const repaired = separateSpheres(pos, otherPos, uRadius, uRadius, 0.5);
      repair = repair.add(repaired.sub(pos).scale(contact));
      // Only a neighbour underneath holds this ball up. Counting any contact
      // lets a ball clinging to another's side be put to sleep in mid-air
      // instead of sliding off it.
      support += max(dir.y, 0) * contact;
    }

    // Averaged, not summed: a ball in a pile touches several neighbours, and
    // each answering with the full correction overshoots.
    const share = 1 / max(touching, 1);
    let stepped = free.add(push.scale(share));

    // Walls act on velocity. The box normal is zero while the ball is free, and
    // every response below is a no-op against a zero normal.
    const wall = boxContactNormal(pos, uRadius, uBounds, uSkin);
    const incoming = stepped;
    stepped = bounceVelocity(stepped, wall, uRestitution);
    // How much speed the wall just removed along its normal — the normal
    // impulse per unit mass, and the bound on how much friction may take.
    // Without that bound, friction acts on the whole tangential plane, which
    // for a vertical pane contains the *downward* axis: a ball that merely
    // brushes a wall has its fall damped every substep and hangs there.
    const wallImpulse = length(stepped.sub(incoming));
    stepped = applyFriction(stepped, wall, wallImpulse, uFriction);
    const supported = clamp(max(wall.y, 0) + support, 0, 1);
    stepped = mix(stepped, restingDamp(stepped, uSleep), supported);

    // ── How far along the step the ball may actually travel ───────────────
    // For each neighbour, solve for the fraction of the step at which the two
    // spheres first touch — the closed form of walking the ball back until it
    // no longer intersects. The smallest answer wins, so it stops flush against
    // the first thing in its way and never enters it.
    const travelVec = stepped.scale(uDt);
    const a = dot(travelVec, travelVec);
    let travel = 1;
    for (let k = 0; k < uCount; k += 1) {
      const u = ((k + 0.5) / uCount) * 0.5;
      const otherPos = texture(uState, vec2(u, 0.5)).xyz;
      const rel = pos.sub(otherPos);
      const b = 2 * dot(rel, travelVec);
      const c = dot(rel, rel) - diameter * diameter;
      const disc = b * b - 4 * a * c;
      const hit = (0 - b - sqrt(max(disc, 0))) / max(2 * a, 0.000001);
      // A root only counts when the path crosses the sphere, the ball is moving,
      // it started outside this neighbour (c > 0), and it would arrive within
      // this step. Anything else leaves the travel budget untouched.
      const real = step(0.000001, disc) * step(0.000001, a) * step(0.000001, c);
      const within = step(0, hit) * step(hit, 1);
      travel = min(travel, mix(1, hit, real * within));
    }

    // Stop a hair short of flush, so rounding cannot land inside.
    const advanced = pos.add(travelVec.scale(travel * 0.999)).add(repair.scale(share * uRepair));
    const moved = clampInsideBox(advanced, uRadius, uBounds);

    return vec4(mix(moved, stepped, isVelocity), 1);
  },
});
