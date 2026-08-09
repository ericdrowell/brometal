import {
  shader,
  vec2,
  vec3,
  vec4,
  texture,
  floor,
  mod,
  fract,
  mix,
  max,
  min,
  pow,
  exp,
  clamp,
  dot,
  step,
  smoothstep,
  normalize,
  cross,
  reflect,
  sqrt,
  atan,
  asin,
  length,
  type Vec2,
  type Vec4,
  type Vec3,
  type Sampler2D,
} from 'brometal';
import { fresnel, blinnPhongSpec, gerstnerWave, fbm2, worleyEdge2 } from 'brometal/shader-functions';

/**
 * Water Bro — the ocean surface. Shading follows Three.js Water Pro
 * (https://threejsroadmap.com/buy-threejs-water-pro), reimplemented for BroMetal
 * with the author's permission.
 *
 * The structure matches Water Pro's own water vertex shader: world XZ is divided
 * by each cascade's patch size, wrapped, and used to sample that cascade's
 * displacement; the three results sum. Three cascades, not one, is what stops
 * the surface reading as a single tiling patch — each covers a different band of
 * wavelength, and their periods are chosen not to share a common multiple.
 *
 * Two BroMetal-specific details drive the sampling helpers below:
 *
 * - Render targets are NEAREST and CLAMP_TO_EDGE, so both the interpolation and
 *   the tiling wrap have to be done by hand. Water Pro's own shader does the
 *   same four-tap bilinear for its wake field, for the same reason.
 * - A fullscreen quad fills a target top-to-bottom while texture v runs the same
 *   way, so a lookup built from the sky's own grid coordinates has to invert v.
 *   `skyTap` does it once, where it can be seen.
 */

/**
 * The wave field: eight Gerstner waves, plus a slow modulation of how rough the
 * sea is locally.
 *
 * Four waves read as a lattice. Two things give it away: with few components the
 * interference pattern is periodic enough for the eye to lock onto, and if their
 * directions cluster the crests all run the same way, so the surface looks
 * combed. This set fans the directions right around the compass and steps the
 * wavelengths by roughly 1.5 each time, so no two share a common multiple and
 * the pattern does not close.
 *
 * The `local` term is what actually sells it. A real sea is not equally rough
 * everywhere — there are glassy patches and torn-up patches metres apart — so a
 * very low-frequency noise scales the whole sum. Because it is applied inside
 * this function, the finite-difference normal picks it up for free and the
 * shading stays consistent with the geometry.
 *
 * Returns the offset in plane terms: x and y displace along the surface, z is
 * height.
 */
function waveOffset(p: Vec2, time: number, choppy: number): Vec3 {
  const w1 = gerstnerWave(p, vec2(1.0, 0.18), 0.2 * choppy, 71, time);
  const w2 = gerstnerWave(p, vec2(0.62, -0.78), 0.16 * choppy, 47, time);
  const w3 = gerstnerWave(p, vec2(-0.35, 0.94), 0.13 * choppy, 31, time);
  const w4 = gerstnerWave(p, vec2(0.88, 0.47), 0.1 * choppy, 23, time);
  const w5 = gerstnerWave(p, vec2(-0.72, -0.69), 0.085 * choppy, 17, time);
  const w6 = gerstnerWave(p, vec2(0.15, -0.99), 0.07 * choppy, 12.5, time);
  const w7 = gerstnerWave(p, vec2(-0.95, 0.31), 0.055 * choppy, 8.3, time);
  const w8 = gerstnerWave(p, vec2(0.44, 0.9), 0.04 * choppy, 5.7, time);
  const sum = w1.add(w2).add(w3).add(w4).add(w5).add(w6).add(w7).add(w8);

  // ~250 m patches of calmer and rougher water, drifting slowly downwind.
  const local = 0.55 + fbm2(p.scale(0.004).add(vec2(time * 0.006, 0)), 2) * 0.95;
  return sum.scale(local);
}

/**
 * Snell's law, written out: BroMetal exposes `reflect` but not `refract`.
 * `incident` points from the eye into the surface, `normal` points up out of it.
 * Total internal reflection cannot happen going air->water, so the k < 0 branch
 * is clamped rather than handled.
 */
function refractRay(incident: Vec3, normal: Vec3, eta: number): Vec3 {
  const cosi = dot(normal, incident);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  return incident.scale(eta).sub(normal.scale(eta * cosi + sqrt(max(k, 0))));
}

/**
 * Caustics on the seabed: two layers of Worley edge distance, drifting against
 * each other. Light refracted through a wavy surface focuses into bright
 * filaments, and the F2-F1 edge of a cellular pattern is the cheap stand-in for
 * that — sharpened hard, because real caustics are thin and bright, not soft.
 */
function caustics(p: Vec2, time: number): number {
  const a = 1 - worleyEdge2(p.scale(0.28).add(vec2(time * 0.06, time * 0.04)));
  const b = 1 - worleyEdge2(p.scale(0.41).sub(vec2(time * 0.05, time * 0.075)));
  return pow(max(a, 0), 7) + pow(max(b, 0), 7) * 0.7;
}

/** What the water reflects: the same map the dome draws, so the two agree. */
/**
 * Bilinear fetch from the equirectangular sky.
 *
 * Render targets are NEAREST on both backends, so a direct lookup shows the
 * map's own texels as hard blocks across the sky. Interpolating by hand costs
 * four taps and avoids raising the raymarch resolution, which is what actually
 * costs time. U wraps (azimuth is periodic); V clamps (the poles are not).
 */
function skyTap(map: Sampler2D, cx: number, cy: number): Vec3 {
  const w = 512;
  const h = 256;
  const u = (mod(cx, w) + 0.5) / w;
  // Row 0 of the sky target is the top of the sky, while v = 0 is the bottom of
  // the image — hence the inversion rather than using `raw` directly.
  const raw = (clamp(cy, 0, h - 1) + 0.5) / h;
  return texture(map, vec2(u, 1 - raw)).xyz;
}

function equirectSky(map: Sampler2D, direction: Vec3): Vec3 {
  const w = 512;
  const h = 256;
  const twoPi = 6.283185307179586;
  const pi = 3.141592653589793;
  const gx = (atan(direction.x, direction.z) / twoPi + 0.5) * w - 0.5;
  const gy = (asin(clamp(direction.y, -1, 1)) / pi + 0.5) * h - 0.5;
  const bx = floor(gx);
  const by = floor(gy);
  const fx = gx - bx;
  const fy = gy - by;
  const s00 = skyTap(map, bx, by);
  const s10 = skyTap(map, bx + 1, by);
  const s01 = skyTap(map, bx, by + 1);
  const s11 = skyTap(map, bx + 1, by + 1);
  return mix(mix(s00, s10, fx), mix(s01, s11, fx), fy);
}

export const WaterSurface = shader({
  // The grid's UVs are unused: every lookup is derived from world XZ so that
  // neighbouring tiles sample one continuous ocean rather than each repeating.
  attributes: { aPosition: 'vec3' },
  uniforms: {
    uViewProj: 'mat4',
    uModel: 'mat4',
    /** Equirectangular sky, shared with the dome so reflection and sky agree. */
    uSky: 'sampler2D',
    /** Wave steepness multiplier — higher sharpens crests into peaks. */
    uChoppy: 'float',
    /** World-space XZ offset of the tile, so the grid can follow the camera. */
    uOrigin: 'vec2',
    uViewPos: 'vec3',
    uSunDir: 'vec3',
    uSkyHorizon: 'vec3',
    uTime: 'float',
    /** World Y of the seabed. The reference's turquoise is sand seen through
     *  depth-attenuated water, so without a bottom there is nothing to colour. */
    uSeabedY: 'float',
    uSandColor: 'vec3',
    /** Beer-Lambert extinction per metre, per channel. Red goes first, which is
     *  exactly why shallow tropical water reads turquoise and deep water blue. */
    uExtinction: 'vec3',
    uCausticStrength: 'float',
    uShallow: 'vec3',
    uFoamColor: 'vec3',
    uNormalStrength: 'float',
    uFoamAmount: 'float',
  },
  varyings: { vWorldPos: 'vec3', vNormal: 'vec3', vHeight: 'float' },

  vertex({ aPosition }, { uViewProj, uModel, uOrigin, uTime, uChoppy }, v) {
    const p = vec2(aPosition.x + uOrigin.x, aPosition.z + uOrigin.y);
    const offset = waveOffset(p, uTime, uChoppy);

    // The normal comes from two tangents of the displaced surface rather than
    // from differencing a height map. Gerstner waves move points sideways as
    // well as up, so a height-only derivative would miss the horizontal shear
    // that gives sharp crests their shape.
    const step = 0.35;
    const alongX = vec2(p.x + step, p.y);
    const alongZ = vec2(p.x, p.y + step);
    const offsetX = waveOffset(alongX, uTime, uChoppy);
    const offsetZ = waveOffset(alongZ, uTime, uChoppy);

    const base = vec3(p.x + offset.x, offset.z, p.y + offset.y);
    const pointX = vec3(alongX.x + offsetX.x, offsetX.z, alongX.y + offsetX.y);
    const pointZ = vec3(alongZ.x + offsetZ.x, offsetZ.z, alongZ.y + offsetZ.y);
    const normal = normalize(cross(pointZ.sub(base), pointX.sub(base)));

    const displaced = vec3(aPosition.x + offset.x, offset.z, aPosition.z + offset.y);
    const world = uModel.mul(vec4(displaced, 1));

    v.vWorldPos = world.xyz;
    v.vNormal = uModel.mul(vec4(normal, 0)).xyz;
    v.vHeight = offset.z;
    return uViewProj.mul(world);
  },

  fragment(
    {
      uSky,
      uViewPos,
      uSunDir,
      uSkyHorizon,
      uTime,
      uSeabedY,
      uSandColor,
      uExtinction,
      uCausticStrength,
      uShallow,
      uFoamColor,
      uNormalStrength,
      uFoamAmount,
    },
    { vWorldPos, vNormal, vHeight },
  ) {
    // The wave normal is exact — it came from two tangents of a closed-form
    // surface — so the fragment only has to add detail below the wavelength of
    // the smallest Gerstner wave. Two fbm taps give a gradient for that, which
    // is what stops the surface reading as smooth plastic between crests.
    const ripple = vec2(vWorldPos.x, vWorldPos.z).scale(0.35).add(vec2(uTime * 0.35, uTime * 0.2));
    const rippleStep = 0.5;
    const h0 = fbm2(ripple, 3);
    const hx = fbm2(ripple.add(vec2(rippleStep, 0)), 3);
    const hz = fbm2(ripple.add(vec2(0, rippleStep)), 3);
    const detail = vec3((h0 - hx) * uNormalStrength, 0, (h0 - hz) * uNormalStrength);
    const normal = normalize(normalize(vNormal).add(detail));

    const viewDir = normalize(uViewPos.sub(vWorldPos));
    const sun = normalize(uSunDir);

    // Water is almost entirely reflective at grazing angles and almost entirely
    // transmissive head-on; that split is the whole look. 0.02 is water's
    // reflectance at normal incidence.
    const facing = max(dot(normal, viewDir), 0);
    const rim = mix(0.02, 0.86, fresnel(normal, viewDir, 5));

    const reflectDir = reflect(vec3(0 - viewDir.x, 0 - viewDir.y, 0 - viewDir.z), normal);
    // Never reflect below the horizon — there is nothing down there to see.
    const bounced = vec3(reflectDir.x, max(reflectDir.y, 0.02), reflectDir.z);
    const reflection = equirectSky(uSky, normalize(bounced));

    // Look *through* the surface: refract the view ray into the water, find
    // where it meets the seabed, and attenuate what comes back by how far it
    // travelled. This is where the colour actually comes from — the previous
    // version just faded between two constants, which can approximate deep
    // water but can never produce the lit-sand turquoise of shallow water.
    const intoWater = refractRay(vec3(0 - viewDir.x, 0 - viewDir.y, 0 - viewDir.z), normal, 0.75);
    // Rays that skim upward never reach the bottom; clamp so they read as a very
    // long path, which attenuates to the deep-water colour on its own.
    const descent = max(0 - intoWater.y, 0.02);
    // The bottom is not flat. Low-frequency relief gives the mottled light and
    // dark patches that read as a real seabed rather than a painted plane —
    // sampled at the surface position, which is close enough to the entry point
    // and avoids a circular dependency on the intersection it is used to find.
    const relief = fbm2(vec2(vWorldPos.x, vWorldPos.z).scale(0.012), 3);
    const bedY = uSeabedY - relief * 7;
    const pathLength = min((vWorldPos.y - bedY) / descent, 260);
    const floorPos = vWorldPos.add(intoWater.scale(pathLength));

    // Sand, with enough low-frequency variation to read as a real bottom.
    const grain = fbm2(vec2(floorPos.x, floorPos.z).scale(0.09), 3);
    const lit = 1 + caustics(vec2(floorPos.x, floorPos.z), uTime) * uCausticStrength;
    const seabed = uSandColor.scale((0.72 + grain * 0.55) * lit);

    // Beer-Lambert, per channel and over the round trip down and back.
    const travel = pathLength * 1.6;
    const transmit = vec3(
      exp(0 - uExtinction.x * travel),
      exp(0 - uExtinction.y * travel),
      exp(0 - uExtinction.z * travel),
    );
    // What the bottom returns, plus the water's own in-scattered light filling in
    // as the bottom fades out.
    const body = vec3(
      seabed.x * transmit.x + uShallow.x * (1 - transmit.x),
      seabed.y * transmit.y + uShallow.y * (1 - transmit.y),
      seabed.z * transmit.z + uShallow.z * (1 - transmit.z),
    );

    // Subsurface scattering. Backlit crests glow because light entering the far
    // side of a wave scatters through the thin water and out towards the eye —
    // strongest when the sun is behind the wave and the wave is high.
    const lift = clamp(vHeight * 0.35 + 0.3, 0, 1);
    const backlight = pow(max(dot(viewDir, vec3(0 - sun.x, 0 - sun.y, 0 - sun.z)), 0), 4);
    const scatter = vec3(0.05, 0.35, 0.3).scale(backlight * lift * 1.6);

    let color = mix(body.add(scatter), reflection, rim);

    // Two specular lobes rather than one. The tight lobe is the glitter path —
    // individual facets catching the sun — and the broad one is the sheen that
    // spreads along the streak between them. A single GGX lobe gave a hard
    // highlight with nothing around it, which is what read as artificial.
    const glint = blinnPhongSpec(normal, sun, viewDir, 900);
    const sheen = blinnPhongSpec(normal, sun, viewDir, 24);
    const sunlight = vec3(1, 0.96, 0.88);
    color = color.add(sunlight.scale(glint * 2.4)).add(sunlight.scale(sheen * 0.10));

    // Foam rides where the Jacobian said the surface folded. It is opaque and
    // rough, so it replaces the shading rather than adding to it.
    // Foam needs STEEPNESS, not altitude. Thresholding on height alone paints
    // every crest the same white at the same elevation, which reads as snow on
    // hilltops rather than as breaking water. Real foam appears where a face is
    // both raised and tilted — about to break — and it is patchy, so a noise
    // field cuts it up instead of leaving a clean contour line.
    const steep = clamp((1 - normal.y) * 4.5, 0, 1);
    const raised = clamp((vHeight - 0.5) * 0.8, 0, 1);
    const patchy = fbm2(vec2(vWorldPos.x, vWorldPos.z).scale(0.2).add(vec2(uTime * 0.12, 0)), 3);
    const foam = clamp(steep * raised * (0.25 + patchy * 1.3) * uFoamAmount * 4, 0, 1);
    const foamMask = smoothstep(0.3, 0.85, foam);
    color = mix(color, uFoamColor, foamMask);

    // Distance haze, so the ocean meets the sky instead of ending at a line.
    const distance = length(uViewPos.sub(vWorldPos));
    const haze = 1 - exp(0 - distance * 0.0009);
    color = mix(color, uSkyHorizon, clamp(haze, 0, 1));

    return vec4(color, 1);
  },
});
