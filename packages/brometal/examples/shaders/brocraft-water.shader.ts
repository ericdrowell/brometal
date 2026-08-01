import {
  shader,
  vec2,
  vec3,
  vec4,
  normalize,
  reflect,
  dot,
  cos,
  length,
  floor,
  max,
  mix,
  pow,
  clamp,
  smoothstep,
  type Vec2,
  type Vec3,
} from 'brometal';
import { fbm2, fresnel, blinnPhongSpec } from 'brometal/shader-functions';

// Same world function as the block shader — the water surface has to agree
// with the terrain it fills, and both derive it from scratch on the GPU.
// The unrounded form is kept separate: the blocks need the voxel floor(), but
// the water tint reads better graded off the true seabed, since a per-column
// depth steps the colour at every tile edge.
function seabedHeight(p: Vec2, amp: number): number {
  const base = fbm2(p.scale(0.0072), 4);
  const detail = fbm2(p.scale(0.055), 3);
  const mountain = clamp((base - 0.52) * 3.2, 0, 1);
  let h = (base - 0.47) * 74 * amp + (detail - 0.5) * (5 + 40 * mountain) * amp;
  if (h < -7) {
    h = -7 + (h + 7) * 0.22;
  }
  return h;
}

function columnHeight(p: Vec2, amp: number): number {
  return floor(seabedHeight(p, amp));
}

/**
 * Four crossing wavelets, differentiated analytically — the surface normal
 * falls out of four cosines instead of a stack of noise samples, which keeps
 * the per-pixel cost sane across a whole ocean.
 */
function ripple(p: Vec2, t: number): Vec3 {
  const k1 = vec2(0.62, 0.31);
  const k2 = vec2(-0.28, 0.71);
  const k3 = vec2(1.43, -0.97);
  const k4 = vec2(-1.11, -1.63);
  const c1 = cos(dot(p, k1) + t * 1.6) * 0.1;
  const c2 = cos(dot(p, k2) + t * 1.15) * 0.085;
  const c3 = cos(dot(p, k3) - t * 2.3) * 0.03;
  const c4 = cos(dot(p, k4) + t * 2.9) * 0.02;
  const dx = k1.x * c1 + k2.x * c2 + k3.x * c3 + k4.x * c4;
  const dz = k1.y * c1 + k2.y * c2 + k3.y * c3 + k4.y * c4;
  return normalize(vec3(-dx, 1, -dz));
}

export default shader({
  attributes: { aPosition: 'vec3' },
  // One instance per column: a single quad laid at sea level. Only the surface
  // is ever drawn — the seabed shows through it, so box sides would be nothing
  // but blended overdraw.
  instanceAttributes: { iCell: 'vec2' },
  uniforms: {
    uViewProj: 'mat4',
    uOrigin: 'vec2',
    uRadius: 'float',
    uSea: 'float',
    uAmp: 'float',
    uTime: 'float',
    uViewPos: 'vec3',
    uSunDir: 'vec3',
    uSunColor: 'vec3',
    uHorizon: 'vec3',
    uZenith: 'vec3',
    uFogStart: 'float',
    uFogEnd: 'float',
  },
  varyings: { vWorld: 'vec3', vDepth: 'float' },

  vertex({ aPosition, iCell }, { uViewProj, uOrigin, uRadius, uSea, uAmp, uTime }, v) {
    const wx = uOrigin.x + iCell.x;
    const wz = uOrigin.y + iCell.y;
    const h = columnHeight(vec2(wx, wz), uAmp);

    // Sea level sits a little below the block top, the way a water block does,
    // and breathes with a slow swell. The swell has to be sampled at the vertex
    // rather than at the column centre: evaluated per column it is constant
    // across each quad, so neighbours sit at slightly different heights and the
    // seabed shows through the step as a thin line along every tile edge.
    // Sampled here, the shared edge of two quads lands on the same coordinate
    // and resolves to the same height, and the surface closes up.
    const px = wx + aPosition.x;
    const pz = wz - aPosition.y;
    const swell = cos(px * 0.35 + uTime * 1.1) * 0.02 + cos(pz * 0.27 - uTime * 0.9) * 0.02;
    const y = uSea + 0.38 + swell;
    const world = vec3(px, y, pz);
    v.vWorld = world;
    v.vDepth = y - (seabedHeight(vec2(px, pz), uAmp) + 0.5);

    let clip = uViewProj.mul(vec4(world, 1));
    // Dry land and anything past the view radius drops out entirely.
    if (h >= uSea) {
      clip = vec4(2, 2, 2, 1);
    }
    if (length(iCell) > uRadius) {
      clip = vec4(2, 2, 2, 1);
    }
    return clip;
  },

  fragment(
    { uViewPos, uSunDir, uSunColor, uHorizon, uZenith, uTime, uFogStart, uFogEnd },
    { vWorld, vDepth },
  ) {
    const n = ripple(vec2(vWorld.x, vWorld.z), uTime);
    const viewDir = normalize(uViewPos.sub(vWorld));
    const sun = normalize(uSunDir);
    const rim = clamp(fresnel(n, viewDir, 4) * 1.15, 0, 1);

    // What the surface reflects is the same sky function the fog uses.
    const r = reflect(viewDir.scale(-1), n);
    const lift = pow(clamp(r.y, 0, 1), 0.42);
    let sky = mix(uHorizon, uZenith, lift);
    const toSun = max(dot(r, sun), 0);
    sky = sky.add(uSunColor.scale(pow(toSun, 6) * 0.25));

    const shallow = vec3(0.17, 0.44, 0.46);
    const deep = vec3(0.02, 0.09, 0.16);
    const body = mix(shallow, deep, clamp(vDepth * 0.16, 0, 1));
    let color = mix(body, sky, rim);

    // Sun glint: a tight specular star plus a broad sheen down the streak.
    color = color.add(uSunColor.scale(blinnPhongSpec(n, sun, viewDir, 700) * 2.4));
    color = color.add(uSunColor.scale(blinnPhongSpec(n, sun, viewDir, 30) * 0.1));

    // Shallow water reads as glass, deep water closes up; grazing angles go
    // mirror-opaque the way real water does.
    const alpha = clamp(0.4 + vDepth * 0.16 + rim * 0.5, 0, 0.97);

    // Horizontal distance only: flying high shouldn't fog out the ground below.
    const dist = length(vec2(uViewPos.x - vWorld.x, uViewPos.z - vWorld.z));
    const fog = pow(smoothstep(uFogStart, uFogEnd, dist), 1.6);
    const d = normalize(vWorld.sub(uViewPos));
    const fogLift = pow(clamp(d.y, 0, 1), 0.42);
    let fogColor = mix(uHorizon, uZenith, fogLift);
    fogColor = mix(fogColor, uHorizon.scale(0.82), clamp(-d.y * 3, 0, 1));
    return vec4(mix(color, fogColor, fog), alpha);
  },
});
