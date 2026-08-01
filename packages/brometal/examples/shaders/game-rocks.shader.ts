import { shader, vec2, vec3, vec4, normalize, cross, mod, mix, clamp, texture, type Vec3 } from 'brometal';
import { rotate2, hash11, lambert, fbm3 } from 'brometal/shader-functions';

// Radial terrain: each unit-sphere direction gets a noise-driven radius, so
// the instanced sphere becomes a lumpy rock. iSeed shifts the noise domain
// per asteroid so no two share a silhouette.
function rockRadius(dir: Vec3, seed: number): number {
  const q = dir.scale(2.3).add(vec3(seed * 37.7, seed * 11.3, seed * 71.9));
  return 1 + (fbm3(q, 4) - 0.5) * 0.55;
}

export default shader({
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
  },
  varyings: { vNormal: 'vec3', vUv: 'vec2', vTint: 'float', vHeight: 'float', vDepth: 'float' },

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
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uLightDir, uTex }, { vNormal, vUv, vTint, vHeight, vDepth }) {
    // Grainy gravel texture graded dusty blue-gray: crevices stay dark and
    // cool, raised lumps lighten, lit per pixel like the terrain.
    const grain = texture(uTex, vUv).xyz;
    const diffuse = lambert(vNormal, uLightDir);
    const t = clamp((vHeight - 0.72) * 1.8, 0, 1);
    const grade = mix(vec3(0.55, 0.62, 0.85), vec3(1.15, 1.15, 1.25), t);
    const base = grain.mul(grade).scale(vTint);
    // Dark-atmosphere fog: with distance, rocks converge on a barely-off-black
    // haze tone instead of pure black — far rocks read as flat silhouettes
    // against the black sky and fade up into detail as they approach.
    const lit = base.scale(0.35 + diffuse * 1.1);
    const haze = vec3(0, 0, 0);
    const dist = 0 - vDepth;
    const fog = clamp((dist - 5) / 130, 0, 1);
    return vec4(mix(lit, haze, fog), 1);
  },
});
