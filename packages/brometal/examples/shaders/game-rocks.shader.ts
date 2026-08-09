import {
  shader,
  vec2,
  vec3,
  vec4,
  normalize,
  cross,
  mod,
  mix,
  clamp,
  texture,
  length,
  max,
  dot,
  sin,
  cos,
  acos,
  exp,
  sqrt,
  smoothstep,
  storageRead,
  storageLength,
  type Vec3,
} from 'brometal';
import { rotate2, hash11, lambert, fbm3 } from 'brometal/shader-functions';

/**
 * Impact craters: circular depressions with raised rims, scattered over the
 * sphere.
 *
 * Each crater is a centre direction and a radius, both derived from hashes of
 * the rock's seed and the crater's index — so the field is different per
 * asteroid, deterministic, and needs no texture or lookup table.
 *
 * The centres are drawn uniformly over the sphere rather than by picking three
 * random components: a random vector in a cube, normalised, clusters toward the
 * eight corners. Uniform azimuth with uniform cos(polar) is the standard fix.
 *
 * The profile is a parabolic bowl that reaches zero at the rim, a narrow
 * Gaussian ridge sitting on the rim itself, and nothing beyond — which is close
 * to what a real impact leaves: excavated bowl, ejecta piled around the edge.
 * Craters simply sum, so overlaps erode each other the way older ones do.
 */
function craters(dir: Vec3, seed: number): number {
  let acc = 0;
  for (let i = 0; i < 14; i = i + 1) {
    const base = seed * 31.7 + i * 13.9;
    const azimuth = hash11(base) * 6.2831853;
    const cosPolar = hash11(base + 4.31) * 2 - 1;
    const sinPolar = sqrt(max(1 - cosPolar * cosPolar, 0));
    const centre = vec3(
      cos(azimuth) * sinPolar,
      cosPolar,
      sin(azimuth) * sinPolar,
    );
    // Angular distance, normalised so d = 1 is the rim whatever the size.
    const angle = acos(clamp(dot(dir, centre), -1, 1));
    const radius = 0.11 + hash11(base + 7.77) * 0.26;
    const d = angle / radius;
    // Fade the bowl out by the rim, or d*d - 1 keeps growing outside it and
    // every crater would raise a dome across the whole rock.
    const bowl = (d * d - 1) * (1 - smoothstep(0.7, 1, d));
    const rim = exp(0 - (d - 1) * (d - 1) * 42);
    acc = acc + bowl * 0.085 + rim * 0.05;
  }
  return acc;
}

// Radial terrain: each unit-sphere direction gets a noise-driven radius, so
// the instanced sphere becomes a lumpy rock. iSeed shifts the noise domain
// per asteroid so no two share a silhouette.
function rockRadius(dir: Vec3, seed: number): number {
  const q = dir.scale(2.3).add(vec3(seed * 37.7, seed * 11.3, seed * 71.9));
  return 1 + (fbm3(q, 4) - 0.5) * 0.4 + craters(dir, seed);
}

export const GameRocks = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  instanceAttributes: { iOffset: 'vec3', iScale: 'float', iSeed: 'float' },
  uniforms: {
    uViewProj: 'mat4',
    uScroll: 'float',
    uWrap: 'float',
    uAhead: 'float',
    uLightDir: 'vec3',
    uTime: 'float',
    uTex: 'sampler2D',
    /** The ship's engines as a moving point light. */
    uEnginePos: 'vec3',
    uEngineColor: 'vec3',
    uPulse: 'float',
  },
  /**
   * Live laser bolts as point lights: xyz is where the bolt is now, w is its
   * brightness (0 for a slot holding a dead shot).
   *
   * A storage buffer rather than uniforms because this is the one thing here
   * that genuinely needs it — a rock has to read state belonging to *other*
   * entities, and there are sixteen of them. Sixteen separate vec4 uniforms
   * would work and be unreadable; the DSL has no arrays to offer instead.
   */
  storage: { uBolts: 'vec4' },
  varyings: {
    vNormal: 'vec3',
    vUv: 'vec2',
    vTint: 'float',
    vHeight: 'float',
    vDepth: 'float',
    vWorldPos: 'vec3',
  },

  vertex({ aPosition, aUv, iOffset, iScale, iSeed }, { uViewProj, uScroll, uWrap, uAhead, uTime }, v) {
    // Displace along the sphere direction, then rebuild the normal from two
    // nearby displaced points (same finite-difference trick as the terrain,
    // but on a tangent frame instead of a grid).
    const dir = normalize(aPosition);
    const t1 = normalize(cross(dir, vec3(0.31, 0.82, 0.47)));
    const t2 = cross(dir, t1);
    const e = 0.12;
    const d1 = normalize(dir.add(t1.scale(e)));
    const d2 = normalize(dir.add(t2.scale(e)));
    const r0 = rockRadius(dir, iSeed);
    const p0 = dir.scale(r0);
    const edge1 = d1.scale(rockRadius(d1, iSeed)).sub(p0);
    const edge2 = d2.scale(rockRadius(d2, iSeed)).sub(p0);
    const normal = normalize(cross(edge1, edge2));

    const spin = uTime * (0.2 + iSeed * 0.8);
    const pr = rotate2(p0.xz, spin);
    const nr = rotate2(normal.xz, spin);
    const local = vec3(pr.x, p0.y, pr.y).scale(iScale);
    const z = mod(iOffset.z + uScroll, uWrap) - uWrap + uAhead;
    const world = local.add(vec3(iOffset.x, iOffset.y, z));
    v.vNormal = vec3(nr.x, normal.y, nr.y);
    // Tile the grain and shift it per rock so instances don't match up.
    v.vUv = aUv.scale(2).add(vec2(iSeed * 5.3, iSeed * 2.9));
    v.vTint = 0.6 + hash11(iSeed * 91.7) * 0.4;
    v.vHeight = r0;
    v.vDepth = z;
    // Needed per fragment for the engine light: the rock's world position is
    // only known here, after the scroll wrap.
    v.vWorldPos = world;
    return uViewProj.mul(vec4(world, 1));
  },

  fragment(
    { uLightDir, uTex, uEnginePos, uEngineColor, uPulse, uBolts },
    { vNormal, vUv, vTint, vHeight, vDepth, vWorldPos },
  ) {
    // Grainy gravel texture graded dusty blue-gray: crevices stay dark and
    // cool, raised lumps lighten, lit per pixel like the terrain.
    const grain = texture(uTex, vUv).xyz;
    const diffuse = lambert(vNormal, uLightDir);
    const t = clamp((vHeight - 0.72) * 1.8, 0, 1);
    const grade = mix(vec3(0.55, 0.62, 0.85), vec3(1.15, 1.15, 1.25), t);
    const base = grain.mul(grade).scale(vTint);
    // No ambient at all. There is nothing out here to bounce light back, so a
    // face turned from the sun receives nothing and goes black — and that total
    // absence is what lets the engine light below read as a light source rather
    // than a tint over something already visible.
    const sun = base.scale(diffuse * 1.5);

    // The ship's engines, close and moving. Inverse-square with a gentle
    // constant so it reaches a few rock-widths rather than dying at the hull,
    // and tinted through the rock's own albedo so it grades the surface instead
    // of painting over it.
    const toEngine = uEnginePos.sub(vWorldPos);
    const distance = length(toEngine);
    const engineDir = normalize(toEngine);
    const falloff = uPulse / (1 + distance * distance * 0.05);
    const engineDiffuse = max(dot(normalize(vNormal), engineDir), 0) * falloff * 3.2;
    // Every live bolt lights the rock it flies past. Dead slots carry w = 0, so
    // they contribute nothing without needing a branch — and a branch would cost
    // more than the arithmetic it skipped, since neighbouring fragments rarely
    // agree on which bolts are alive.
    let boltLight = 0;
    const bolts = storageLength(uBolts);
    for (let i = 0; i < bolts; i = i + 1) {
      const bolt = storageRead(uBolts, i);
      const toBolt = vec3(bolt.x, bolt.y, bolt.z).sub(vWorldPos);
      const boltDist = length(toBolt);
      // Deliberately faint. `base` is already the fully-lit rock colour, so a
      // multiplier anywhere near 1 doubles the surface and reads as a flash
      // bulb — it took three passes to accept how small this number has to be.
      // Two bolts fire at once and their contributions stack, which is the
      // other half of why the obvious values are far too hot.
      const boltFall = bolt.w / (1 + boltDist * boltDist * 0.9);
      boltLight = boltLight + max(dot(normalize(vNormal), normalize(toBolt)), 0) * boltFall;
    }

    const lit = sun
      .add(base.mul(uEngineColor).scale(engineDiffuse))
      .add(base.scale(boltLight * 0.75));
    const haze = vec3(0, 0, 0);
    const dist = 0 - vDepth;
    const fog = clamp((dist - 5) / 130, 0, 1);
    return vec4(mix(lit, haze, fog), 1);
  },
});
