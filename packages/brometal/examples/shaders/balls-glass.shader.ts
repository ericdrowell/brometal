import {
  shader,
  vec2,
  vec3,
  vec4,
  normalize,
  reflect,
  texture,
  dot,
  abs,
  min,
  max,
  mix,
  pow,
  step,
  clamp,
  length,
  smoothstep,
  targetUv,
  distance,
  type Vec3,
} from 'brometal';
import { fresnel, specGGX } from 'brometal/shader-functions';

/**
 * The tank. Glass is almost entirely about what it reflects: face-on it passes
 * nearly everything through, edge-on it turns to a mirror, and the speed of
 * that transition is what the eye reads as glass rather than tinted plastic.
 *
 * The reflection comes from marching the reflected ray through a copy of the
 * scene the camera already drew. See the note on the march itself for why that
 * beat intersecting the balls analytically, which is exact but far too slow at
 * this fill rate.
 *
 * Output is divided by its own alpha, so the blend `rgb * a + background *
 * (1 - a)` lands on exactly the radiance intended: reflection scaled by
 * fresnel, glare added on top, everything else transmitted. Without the divide
 * a bright highlight is scaled down by an alpha chosen for the reflection.
 */

/**
 * The studio the glass reflects when the traced ray misses everything. A pane
 * reflecting a flat colour looks like plastic no matter how the fresnel is
 * tuned; it needs something with structure to smear across it.
 */
function studioEnv(dir: Vec3, sky: Vec3, horizon: Vec3, keyDir: Vec3): Vec3 {
  const up = clamp(dir.y * 0.5 + 0.5, 0, 1);
  const base = mix(horizon.scale(0.22), sky, smoothstep(0.4, 0.98, up));
  const band = pow(1 - abs(dir.y), 7) * 0.34;

  const key = max(dot(dir, keyDir), 0);
  const core = pow(key, 600) * 45;
  const soft = pow(key, 40) * 1.4;
  const spill = pow(key, 5) * 0.18;

  // Two fixed softboxes, roughly horizontal. The scene light is almost directly
  // overhead and a vertical pane reflects sideways, so on its own it never
  // lands a highlight on the walls of the tank. These draw the bright streaks
  // down the panes, and they are broad on purpose: a flat pane reflects nearly
  // one direction across its whole face, so a tight lobe either misses it
  // entirely or floods it.
  const boxA = max(dot(dir, normalize(vec3(0 - 0.62, 0.3, 0.72))), 0);
  const boxB = max(dot(dir, normalize(vec3(0.78, 0.16, 0 - 0.6))), 0);
  const rigA = pow(boxA, 20) * 2.2 + pow(boxA, 4) * 0.3;
  const rigB = pow(boxB, 30) * 1.6 + pow(boxB, 5) * 0.2;

  return base
    .add(horizon.scale(band))
    .add(vec3(1, 0.98, 0.94).scale(core + soft + spill))
    .add(vec3(0.96, 0.98, 1).scale(rigA))
    .add(vec3(1, 0.97, 0.93).scale(rigB));
}

export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  uniforms: {
    uViewProj: 'mat4',
    uBounds: 'vec3',
    uViewPos: 'vec3',
    uLightPos: 'vec3',
    uSkyTint: 'vec3',
    uHorizon: 'vec3',
    uGlassTint: 'vec3',
    uEdge: 'float',
    uGlare: 'float',
    uScene: 'sampler2D',
    uReach: 'float',
    uThickness: 'float',
    uMirror: 'float',
  },
  varyings: { vNormal: 'vec3', vWorld: 'vec3', vLocal: 'vec3' },

  vertex({ aPosition, aNormal }, { uViewProj, uBounds }, v) {
    // The cube is authored at ±0.5, so doubling maps it onto the half extents.
    const world = vec3(aPosition.x * uBounds.x * 2, aPosition.y * uBounds.y * 2, aPosition.z * uBounds.z * 2);
    v.vNormal = aNormal;
    v.vWorld = world;
    v.vLocal = aPosition;
    return uViewProj.mul(vec4(world, 1));
  },

  fragment(
    {
      uViewPos,
      uLightPos,
      uSkyTint,
      uHorizon,
      uGlassTint,
      uEdge,
      uGlare,
      uViewProj,
      uScene,
      uReach,
      uThickness,
      uMirror,
    },
    { vNormal, vWorld, vLocal },
  ) {
    const viewDir = normalize(uViewPos.sub(vWorld));
    const light = normalize(uLightPos.sub(vWorld));

    // Both faces of the tank are drawn, so the far panes arrive with normals
    // pointing away from the eye. Flipping those lets one set of maths serve
    // both, instead of the back panes going dark exactly where they should be
    // catching the most light.
    const raw = normalize(vNormal);
    const n = raw.scale(mix(0 - 1, 1, step(0, dot(raw, viewDir))));

    // Schlick against glass's real normal-incidence reflectance. 0.04 is the
    // number that keeps a pane nearly invisible head-on — push it higher and
    // the tank turns to perspex.
    const cosTheta = clamp(dot(n, viewDir), 0, 1);
    const f = 0.04 + 0.96 * pow(1 - cosTheta, 5);

    const bounced = reflect(viewDir.scale(0 - 1), n);

    // ── What the pane reflects ────────────────────────────────────────────
    // The ray is walked through a copy of the scene the camera already drew,
    // in *screen* space. A fixed world-space step covers a wildly different
    // number of pixels depending on how the ray lies relative to the view, so
    // neighbouring fragments latch onto their hit at different steps and the
    // reflection tears into repeated copies of the same ball. Even steps along
    // the projected line keep that stable.
    //
    // Tracing the reflected ray against every ball analytically was tried and
    // is exact — no smearing, no repeats, and it sees balls that are off-screen
    // — but it costs 0.3 ms per ball at this fill rate (53 ms/frame for 160,
    // 104 ms for 320) because the tank is drawn double-sided and the loop
    // cannot be skipped for panes that barely reflect: sampling a texture from
    // inside an `if` breaks WGSL's uniform control flow rule. Marching is O(the
    // step count) instead of O(the ball count), which is why real-time engines
    // use it.
    const rayEnd = vWorld.add(bounced.scale(uReach));
    const uvStart = targetUv(uViewProj.mul(vec4(vWorld, 1)));
    const uvEnd = targetUv(uViewProj.mul(vec4(rayEnd, 1)));
    const depthStart = distance(vWorld, uViewPos);
    const depthEnd = distance(rayEnd, uViewPos);

    let hitUv = vec2(0.5, 0.5);
    let hitAlong = 1;
    let found = 0;
    // Seeded from the pane itself. The ray starts behind everything between the
    // camera and this pane, and saying so is what stops step one registering
    // that as a hit.
    let wasInFront = step(depthStart, texture(uScene, uvStart).w);
    for (let i = 1; i < 19; i += 1) {
      const along = i / 18;
      const uv = mix(uvStart, uvEnd, along);
      // Depth interpolates through its reciprocal — a straight line in the
      // world is not a straight line in depth once projected.
      const rayDepth = 1 / mix(1 / depthStart, 1 / depthEnd, along);
      const sampled = texture(uScene, uv);
      const onScreen = step(0, uv.x) * step(uv.x, 1) * step(0, uv.y) * step(uv.y, 1);
      // A hit is a *crossing*: in front of the recorded surface last step and
      // behind it now. Merely being behind something is not an intersection —
      // that let the ray attach itself to whatever happened to be in the way,
      // which is where the repeated copies came from.
      const nowBehind = step(sampled.w, rayDepth);
      const shallow = step(rayDepth - sampled.w, uThickness);
      const isHit = onScreen * wasInFront * nowBehind * shallow;
      const take = isHit * (1 - found);
      hitUv = mix(hitUv, uv, take);
      hitAlong = mix(hitAlong, along, take);
      found = max(found, isHit);
      wasInFront = step(rayDepth, sampled.w);
    }

    // Binary-refine onto the surface. The loop only knows the crossing happened
    // somewhere inside one step, and taking the far end of that step is what
    // stretches a ball into a bar: a whole run of fragments lands on the same
    // coarse sample. Five halvings put the hit on the surface, not near it.
    let lo = hitAlong - 1 / 18;
    let hi = hitAlong;
    for (let r = 0; r < 5; r += 1) {
      const mid = (lo + hi) * 0.5;
      const probeUv = mix(uvStart, uvEnd, mid);
      const probeDepth = 1 / mix(1 / depthStart, 1 / depthEnd, mid);
      const behind = step(texture(uScene, probeUv).w, probeDepth);
      lo = mix(lo, mid, 1 - behind);
      hi = mix(hi, mid, behind);
    }
    const refinedUv = mix(uvStart, uvEnd, hi);
    const hitColour = texture(uScene, refinedUv).xyz;

    const env = studioEnv(bounced, uSkyTint, uHorizon, light);
    // Screen-space reflection only knows what is on screen, so a hit drifting
    // off the edge hands back to the studio rather than stopping dead.
    const edge =
      smoothstep(0, 0.14, hitUv.x) *
      smoothstep(0, 0.14, 1 - hitUv.x) *
      smoothstep(0, 0.14, hitUv.y) *
      smoothstep(0, 0.14, 1 - hitUv.y);
    // A ray running nearly parallel to the view plane covers a long screen
    // distance per unit of depth, which is exactly where the search is least
    // reliable. Fading there trades a little reflection for no smearing.
    const grazing = smoothstep(0.12, 0.4, abs(dot(bounced, viewDir)));
    const confidence = found * edge * grazing * uMirror;
    // A real pane reflects at both of its surfaces; one hit stands in for both.
    const mirror = mix(env, hitColour.scale(1.35).add(env.scale(0.2)), confidence);

    // Direct glare, separate from the reflection: a near-mirror lobe for the
    // hotspot and a wide one for the bloom around it. The hotspot is capped
    // because a GGX lobe this tight returns enormous values at its centre.
    const hotspot = min(specGGX(n, light, viewDir, 0.05), 14) * 2.4;
    const bloom = specGGX(n, light, viewDir, 0.34) * 0.4;
    const glare = vec3(1, 0.985, 0.95).scale((hotspot + bloom) * uGlare);

    // The bevels: distance to the nearest cube edge, so the frame catches light
    // the way a real tank's seams do. Corners take three faces, not two.
    const ax = abs(vLocal.x);
    const ay = abs(vLocal.y);
    const az = abs(vLocal.z);
    const secondAxis = max(min(ax, ay), min(max(ax, ay), az));
    const seam = smoothstep(0.45, 0.5, secondAxis);
    const corner = smoothstep(0.42, 0.5, min(min(ax, ay), az));
    const rim = fresnel(n, viewDir, 3.4);
    const edging = uSkyTint.add(vec3(0.24, 0.3, 0.28)).scale((seam * 0.75 + corner * 1.4) * uEdge);

    // Absorption: a longer path through the pane transmits greener and dimmer.
    // Real float glass is green in precisely this way, and it is most of what
    // separates it from clear plastic.
    const absorb = mix(vec3(1, 1, 1), uGlassTint, clamp(1 - cosTheta, 0, 1) * 0.85);

    const reflected = mirror.mul(absorb).scale(f).add(glare).add(edging);
    const glareLuma = clamp(length(glare) * 0.5, 0, 1);
    const alpha = clamp(
      f * 0.92 + glareLuma + (seam * 0.32 + corner * 0.62) * uEdge + rim * 0.05,
      0.02,
      0.985,
    );
    return vec4(reflected.scale(1 / alpha), alpha);
  },
});
