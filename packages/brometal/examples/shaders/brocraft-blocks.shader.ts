import {
  shader,
  vec2,
  vec3,
  vec4,
  normalize,
  dot,
  length,
  texture,
  floor,
  abs,
  min,
  max,
  mix,
  pow,
  step,
  clamp,
  smoothstep,
  type Vec2,
  type Vec3,
} from 'brometal';
import {
  fbm2,
  vnoise2,
  hash21,
  luminance,
  lambert,
  blinnPhongSpec,
  hemisphereLight,
} from 'brometal/shader-functions';

// ── The world, as a pure function of world position ────────────────────────
//
// Nothing about the terrain lives on the CPU. Every block's height, material
// and visibility is derived here, in the vertex shader, from the grid slot
// the instance occupies. The app uploads integer grid offsets once and then
// only moves a vec2 origin as the player walks.

/** Integer Y of the topmost block in a column — the whole world in one function. */
function columnHeight(p: Vec2, amp: number): number {
  const base = fbm2(p.scale(0.0072), 4);
  const detail = fbm2(p.scale(0.055), 3);
  // Detail amplitude rides the continent mask, so plains stay rolling while
  // the high ground breaks up into ridges and peaks.
  const mountain = clamp((base - 0.52) * 3.2, 0, 1);
  let h = (base - 0.47) * 74 * amp + (detail - 0.5) * (5 + 40 * mountain) * amp;
  // Soft floor under the deep ocean: keeps the seabed close enough to read
  // through the water instead of dropping into unlit blackness.
  if (h < -7) {
    h = -7 + (h + 7) * 0.22;
  }
  return floor(h);
}

/** 0 = grass, 1 = dirt, 2 = stone, 3 = sand. Depth is the layer below the surface. */
function blockType(p: Vec2, h: number, depth: number, sea: number): number {
  const rocky = fbm2(p.scale(0.031), 3);
  let t = 2;
  if (depth < 0.5) {
    t = 0;
    // Beaches and the seabed are sand; peaks and outcrops break through to rock.
    if (h < sea + 2.5) {
      t = 3;
    }
    if (h > 20 + rocky * 26) {
      t = 2;
    }
    if (rocky > 0.75 && h > sea + 5.5) {
      t = 2;
    }
  } else if (depth < 3.5) {
    t = 1;
    if (h < sea + 2.5) {
      t = 3;
    }
  }
  return t;
}

export const BrocraftBlocks = shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  // One instance per block: (grid X, grid Z, layer below the surface).
  instanceAttributes: { iCell: 'vec3' },
  uniforms: {
    uViewProj: 'mat4',
    uOrigin: 'vec2',
    uRadius: 'float',
    uLayers: 'float',
    uSea: 'float',
    uAmp: 'float',
    uViewPos: 'vec3',
    uSunDir: 'vec3',
    uSunColor: 'vec3',
    uSkyTint: 'vec3',
    uGroundTint: 'vec3',
    uHorizon: 'vec3',
    uZenith: 'vec3',
    uFogStart: 'float',
    uFogEnd: 'float',
    uGrass: 'sampler2D',
    uDirt: 'sampler2D',
    uStone: 'sampler2D',
    uSand: 'sampler2D',
  },
  varyings: { vNormal: 'vec3', vWorld: 'vec3', vType: 'float', vBase: 'float', vAo: 'float' },

  vertex({ aPosition, aNormal, iCell }, { uViewProj, uOrigin, uRadius, uLayers, uSea, uAmp }, v) {
    const layer = iCell.z;
    const wx = uOrigin.x + iCell.x;
    const wz = uOrigin.y + iCell.y;
    const cell = vec2(wx, wz);

    const h = columnHeight(cell, uAmp);
    const by = h - layer;

    // The four neighbouring columns answer everything else: which blocks are
    // buried (and can be skipped), how deep the skirt must reach, and how much
    // ambient light each corner sees.
    const hpx = columnHeight(vec2(wx + 1, wz), uAmp);
    const hnx = columnHeight(vec2(wx - 1, wz), uAmp);
    const hpz = columnHeight(vec2(wx, wz + 1), uAmp);
    const hnz = columnHeight(vec2(wx, wz - 1), uAmp);
    const hmin = min(min(hpx, hnx), min(hpz, hnz));

    // Vertical extent. The bottom layer stretches down to the lowest exposed
    // neighbour, so a cliff of any depth is sealed by one stretched block
    // instead of needing a layer per metre.
    const top = by + 0.5;
    let bottom = by - 0.5;
    if (layer > uLayers - 1.5) {
      bottom = min(bottom, hmin - 1);
    }
    const y = (top + bottom) * 0.5 + aPosition.y * (top - bottom);

    const world = vec3(wx + aPosition.x, y, wz + aPosition.z);

    // Ambient occlusion, Minecraft-style: a corner darkens when the neighbour
    // it leans toward stands above this block, plus a gentle bottom-to-top
    // gradient down the sides.
    const ox = mix(step(by + 0.5, hnx), step(by + 0.5, hpx), step(0, aPosition.x));
    const oz = mix(step(by + 0.5, hnz), step(by + 0.5, hpz), step(0, aPosition.z));
    const crease = 1 - 0.26 * ox - 0.26 * oz;
    v.vAo = crease * (0.78 + 0.22 * (aPosition.y + 0.5));

    v.vNormal = aNormal;
    v.vWorld = world;
    v.vBase = by;
    v.vType = blockType(cell, h, layer, uSea);

    // Culling: buried blocks (every neighbour at least as tall) and anything
    // past the round view distance collapse to a clipped degenerate triangle.
    let clip = uViewProj.mul(vec4(world, 1));
    if (layer > 0.5 && hmin >= by) {
      clip = vec4(2, 2, 2, 1);
    }
    if (length(vec2(iCell.x, iCell.y)) > uRadius) {
      clip = vec4(2, 2, 2, 1);
    }
    return clip;
  },

  fragment(
    {
      uViewPos,
      uSunDir,
      uSunColor,
      uSkyTint,
      uGroundTint,
      uHorizon,
      uZenith,
      uFogStart,
      uFogEnd,
      uSea,
      uGrass,
      uDirt,
      uStone,
      uSand,
    },
    { vNormal, vWorld, vType, vBase, vAo },
  ) {
    const n0 = normalize(vNormal);

    // World-aligned UVs: the texture is nailed to the world grid, so adjacent
    // blocks of the same material flow into each other and every face lands on
    // an exact 1×1 tile no matter how far a skirt block is stretched.
    let uv = vec2(vWorld.x, vWorld.z);
    if (abs(n0.x) > 0.5) {
      uv = vec2(vWorld.z, -vWorld.y);
    } else if (abs(n0.z) > 0.5) {
      uv = vec2(vWorld.x, -vWorld.y);
    }

    // Material selection is a weight vector, not a branch: WGSL only allows
    // texture() from uniform control flow, so every material is sampled and
    // the unwanted ones are multiplied away. Exactly one weight is 1.
    //
    // Grass blocks wear dirt on their sides with a ragged green lip at the top —
    // the classic silhouette, drawn from the height inside the block.
    const localY = vWorld.y - vBase + 0.5;
    const grassBlock = 1 - step(0.5, vType);
    const lip = step(0.52 + vnoise2(uv.scale(6.5)) * 0.34, localY);
    const wGrass = grassBlock * lip;
    const wDirt = grassBlock * (1 - lip) + (step(0.5, vType) - step(1.5, vType));
    const wStone = step(1.5, vType) - step(2.5, vType);
    const wSand = step(2.5, vType);

    // Detail fades out with distance. Past ~40 blocks a texel covers less than
    // a pixel, so the luminance gradient feeding the bump is just mip noise —
    // left in, it sparkles. Specular falls off with it.
    const camDist = length(uViewPos.sub(vWorld));
    const detail = 1 - smoothstep(12, 44, camDist);

    // One repeat per two blocks rather than per block: the same scan then sits
    // two mip levels lower at any given distance, which is most of what reads
    // as grain, and the tiling period doubles.
    const tuv = uv.scale(0.5);
    const e = 0.01;
    const ex = vec2(e, 0);
    const ey = vec2(0, e);
    // A scan tiled once per block averages out to flat paint at any distance,
    // so the ground also varies over ~30 blocks: lush and dry patches of grass,
    // lighter and darker beds of rock. This is what reads as depth from far
    // away, where the per-texel detail has long since mipped away.
    const biome = fbm2(vec2(vWorld.x, vWorld.z).scale(0.035), 3);
    const grass = texture(uGrass, tuv).xyz.mul(mix(vec3(0.84, 0.96, 0.74), vec3(1.14, 1.1, 0.86), biome));
    const stone = texture(uStone, tuv).xyz.mul(mix(vec3(0.78, 0.8, 0.85), vec3(1.06, 1.04, 1.0), biome));
    const sand = texture(uSand, tuv).xyz.mul(vec3(0.94, 0.85, 0.66));
    let albedo = grass.scale(wGrass).add(texture(uDirt, tuv).xyz.scale(wDirt));
    albedo = albedo.add(stone.scale(wStone)).add(sand.scale(wSand));

    const atX = texture(uGrass, tuv.add(ex)).xyz
      .scale(wGrass)
      .add(texture(uDirt, tuv.add(ex)).xyz.scale(wDirt))
      .add(texture(uStone, tuv.add(ex)).xyz.scale(wStone))
      .add(texture(uSand, tuv.add(ex)).xyz.scale(wSand));
    const atY = texture(uGrass, tuv.add(ey)).xyz
      .scale(wGrass)
      .add(texture(uDirt, tuv.add(ey)).xyz.scale(wDirt))
      .add(texture(uStone, tuv.add(ey)).xyz.scale(wStone))
      .add(texture(uSand, tuv.add(ey)).xyz.scale(wSand));
    const lum = vec3(luminance(albedo), luminance(atX), luminance(atY));

    const shine = 12 * wGrass + 16 * wDirt + 54 * wStone + 30 * wSand;
    const specular = (0.03 * wGrass + 0.04 * wDirt + 0.16 * wStone + 0.09 * wSand) * (0.3 + 0.7 * detail);
    const relief = (1.5 * wGrass + 1.6 * wDirt + 2.1 * wStone + 0.9 * wSand) * detail;

    // Per-block value variation keeps a field of identical blocks from
    // reading as wallpaper.
    const tint = 0.95 + hash21(vec2(floor(vWorld.x + 0.001), floor(vWorld.z + 0.001))) * 0.1;
    // Cavity shading: a texel darker than its neighbourhood is down inside a
    // crack or between blades, so it loses ambient light. Free depth — the
    // luminance was already fetched for the bump.
    const cavity = clamp(0.8 + lum.x * 0.42, 0.72, 1.08);
    albedo = albedo.scale(tint * cavity);

    // Bump: tangent frame is trivial on axis-aligned faces, so the luminance
    // gradient can be pushed straight into the normal.
    const bump = vec2((lum.x - lum.y) * relief * 5, (lum.x - lum.z) * relief * 5);
    let tangent = vec3(1, 0, 0);
    let bitangent = vec3(0, 0, 1);
    if (abs(n0.x) > 0.5) {
      tangent = vec3(0, 0, 1);
      bitangent = vec3(0, -1, 0);
    } else if (abs(n0.z) > 0.5) {
      tangent = vec3(1, 0, 0);
      bitangent = vec3(0, -1, 0);
    }
    const n = normalize(n0.add(tangent.scale(bump.x)).add(bitangent.scale(bump.y)));

    const viewDir = normalize(uViewPos.sub(vWorld));
    const sun = normalize(uSunDir);
    const diffuse = lambert(n, sun);
    const ambient = hemisphereLight(n, uSkyTint, uGroundTint).scale(vAo);
    const spec = blinnPhongSpec(n, sun, viewDir, shine) * specular * step(0.02, diffuse);
    // Blocks below the waterline pick up a cool cast, as if seen through it.
    const wet = 1 - smoothstep(uSea - 0.5, uSea + 1.5, vWorld.y);
    let color = albedo.mul(ambient.add(uSunColor.scale(diffuse * vAo))).add(uSunColor.scale(spec));
    color = mix(color, color.mul(vec3(0.55, 0.78, 0.95)), wet * 0.55);

    // Fog is the sky itself, so the far edge of the grid melts into the horizon.
    // Horizontal distance only: flying high shouldn't fog out the ground below.
    const dist = length(vec2(uViewPos.x - vWorld.x, uViewPos.z - vWorld.z));
    const fog = pow(smoothstep(uFogStart, uFogEnd, dist), 1.6);
    const d = normalize(vWorld.sub(uViewPos));
    const lift = pow(clamp(d.y, 0, 1), 0.42);
    let sky = mix(uHorizon, uZenith, lift);
    sky = mix(sky, uHorizon.scale(0.82), clamp(-d.y * 3, 0, 1));
    const toSun = max(dot(d, sun), 0);
    sky = sky.add(uSunColor.scale(pow(toSun, 6) * 0.22));
    return vec4(mix(color, sky, fog), 1);
  },
});
