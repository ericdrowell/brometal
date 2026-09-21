import {
  abs,
  atan,
  clamp,
  cos,
  floor,
  fract,
  length,
  log,
  max,
  min,
  mix,
  pow,
  shader,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
  vec4,
  type Vec2,
} from 'brometal';
import {
  fbm2,
  hash11,
  rotate2,
  voronoi2,
} from 'brometal/shader-functions';

/** A cheap glow curve that stays finite at its centre. */
function glow(distance: number, radius: number, strength: number): number {
  return strength / max(abs(distance) + radius, radius);
}

/** Fine stars with a broad halo. The threshold changes per preset. */
function starLayer(p: Vec2, seed: number): number {
  const cell = floor(p.x) + floor(p.y) * 173;
  const point = hash11(cell + seed * 19);
  const local = vec2(fract(p.x) - 0.5, fract(p.y) - 0.5);
  const spark = smoothstep(0.035, 0, length(local)) * step(0.89, point);
  const halo = smoothstep(0.22, 0, length(local)) * step(0.975, point) * 0.4;
  return spark + halo;
}

export const Showcase = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: {
    uTime: 'float',
    uAspect: 'float',
    uScene: 'float',
    uSeed: 'float',
    uPointer: 'vec2',
    uPrimary: 'vec3',
    uAccent: 'vec3',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment(
    { uTime, uAspect, uScene, uSeed, uPointer, uPrimary, uAccent },
    { vUv },
  ) {
    const family = uScene;
    const time = uTime * 0.12;
    const mouse = uPointer.sub(vec2(0.5, 0.5)).scale(0.16);
    let p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5).sub(mouse);
    const radius = length(p);
    const angle = atan(p.y, p.x);
    let value = 0;
    let detail = 0;

    // Cosmos: polar distortion, dust noise and sparse analytic stars.
    if (family < 0.5) {
      const twist = angle + radius * 5 - time * 2;
      const dustUv = vec2(cos(twist), sin(twist)).scale(radius * 4 + 0.2);
      const dust = fbm2(dustUv.add(vec2(time, uSeed)), 5);
      const ringRadius = 0.2;
      const ring = glow(radius - ringRadius, 0.008, 0.012);
      const arms = pow(max(sin(twist * 2) * 0.5 + 0.5, 0), 5);
      const stars = starLayer(vUv.scale(90), uSeed);
      value = ring + dust * arms * 1.4 + stars;
      detail = smoothstep(ringRadius + 0.02, ringRadius - 0.01, radius);
    }

    // Fluid and fire: two moving noise fields distort one another.
    if (family > 0.5 && family < 1.5) {
      const flowA = fbm2(p.scale(3.5).add(vec2(time * 1.4, 0 - time)), 5);
      const flowB = fbm2(p.scale(7).add(vec2(flowA * 2, time * 0.7 + uSeed)), 4);
      const cells = voronoi2(p.scale(5).add(vec2(time, flowA)));
      value = pow(clamp(flowA * 0.8 + flowB * 0.7, 0, 1), 2) + glow(cells - 0.18, 0.03, 0.01);
      detail = smoothstep(0.72, 0.2, cells) * flowB;
    }

    // Geometric: folded polar coordinates produce crisp repeated structure.
    if (family > 1.5 && family < 2.5) {
      const sides = 5;
      const wedge = abs(fract(angle * 0.159155 * sides + 0.5) - 0.5) * 2;
      const bands = abs(fract(radius * 12 - time + wedge * 2) - 0.5);
      const spokes = abs(fract(wedge * 3) - 0.5);
      value = glow(bands - 0.12, 0.012, 0.016) + glow(spokes - 0.08, 0.01, 0.009);
      detail = fbm2(vec2(wedge * 4, radius * 8 - time), 3);
    }

    // Organic: cellular edges surrounded by soft, breathing membranes.
    if (family > 2.5 && family < 3.5) {
      const drift = vec2(sin(time + p.y * 3), cos(time * 0.8 + p.x * 4)).scale(0.18);
      const cellsA = voronoi2(p.scale(5).add(drift).add(vec2(uSeed, 0)));
      const cellsB = voronoi2(p.scale(10).sub(drift));
      const membrane = glow(cellsA - 0.28 - sin(time * 2 + cellsB * 8) * 0.035, 0.018, 0.012);
      value = membrane + smoothstep(0.4, 0.05, cellsB) * 0.5;
      detail = fbm2(p.scale(4).add(vec2(0, time)), 4);
    }

    // Dream worlds: a procedural horizon, ridged terrain and celestial disc.
    if (family > 3.5 && family < 4.5) {
      const terrain = fbm2(vec2(p.x * 3, uSeed + time), 5) * 0.25;
      const horizon = p.y + 0.14 - terrain;
      const sunCenter = p.sub(vec2(0.18 * sin(time), 0.15));
      const sun = smoothstep(0.18, 0.16, length(sunCenter));
      const gridX = glow(abs(fract((p.x / max(abs(p.y + 0.52), 0.03)) * 7) - 0.5) - 0.48, 0.008, 0.004);
      const gridY = glow(abs(fract(1 / max(abs(p.y + 0.52), 0.03) + time) - 0.5) - 0.48, 0.008, 0.004);
      value = sun + smoothstep(0.03, 0, abs(horizon)) + (gridX + gridY) * step(horizon, 0);
      detail = smoothstep(0.25, -0.2, horizon);
    }

    // Energy: filaments and interference rings around a contained core.
    if (family > 4.5 && family < 5.5) {
      const rotated = rotate2(p, sin(time) * 0.4);
      const field = sin(angle * 4 + fbm2(rotated.scale(5), 4) * 7 + time * 5);
      const filament = glow(field, 0.018, 0.015) * smoothstep(0.62, 0.05, radius);
      const rings = glow(sin(radius * 35 - time * 8), 0.03, 0.01);
      value = filament + rings * 0.35 + glow(radius, 0.04, 0.018);
      detail = fbm2(p.scale(8).add(vec2(time, uSeed)), 4);
    }

    // Fractals: a compact Julia iteration with orbit-trap shading.
    if (family > 5.5 && family < 6.5) {
      let zx = p.x * 2.2;
      let zy = p.y * 2.2;
      const cx = -0.72 + sin(time) * 0.12;
      const cy = 0.19 + cos(time * 0.7) * 0.15;
      let trap = 2;
      for (let i = 0; i < 24; i += 1) {
        const nextX = zx * zx - zy * zy + cx;
        zy = 2 * zx * zy + cy;
        zx = nextX;
        trap = min(trap, abs(zx) + abs(zy));
        const scaleDown = step(8, zx * zx + zy * zy);
        zx *= 1 - scaleDown * 0.03;
        zy *= 1 - scaleDown * 0.03;
      }
      value = glow(trap - 0.16, 0.02, 0.02) + smoothstep(3, 0.4, abs(zx) + abs(zy)) * 0.5;
      detail = fract(log(max(abs(zx) + abs(zy), 0.001)) * 0.35);
    }

    // Retro future: an accelerating polar tunnel with scan-line sparkle.
    if (family > 6.5 && family < 7.5) {
      const tunnelUv = vec2(angle * 0.159155 * 8, 0.35 / max(radius, 0.025) + time * 2);
      const tileX = abs(fract(tunnelUv.x) - 0.5);
      const tileY = abs(fract(tunnelUv.y) - 0.5);
      const lines = glow(tileX - 0.47, 0.008, 0.006) + glow(tileY - 0.47, 0.008, 0.006);
      value = lines * smoothstep(0.7, 0.05, radius) + starLayer(vUv.scale(70), uSeed) * radius;
      detail = sin(angle * 3 + time) * 0.5 + 0.5;
    }

    // Light studies: luminous caustic nets and a controlled dark occluder.
    if (family > 7.5 && family < 8.5) {
      const causticA = voronoi2(p.scale(7).add(vec2(time, 0)));
      const causticB = voronoi2(p.scale(9).add(vec2(0, time * 1.3)));
      const net = glow(causticA - causticB, 0.012, 0.01);
      const rays = pow(max(0, cos(angle * 5 + time)), 18) / max(radius + 0.1, 0.1);
      value = net + rays * 0.45 + glow(radius - 0.22, 0.012, 0.012);
      detail = smoothstep(0.24, 0.2, radius);
    }

    // Digital artifacts: quantized blocks, scanlines and displaced channels.
    if (family > 8.5) {
      const size = 26;
      const block = vec2(floor(vUv.x * size) / size, floor(vUv.y * size) / size);
      const noise = hash11(floor(block.x * size) + floor(block.y * size) * 97 + floor(time * 12));
      const signal = fbm2(block.scale(5).add(vec2(time, uSeed)), 4);
      const scan = sin(vUv.y * 350) * 0.5 + 0.5;
      const tear = step(0.86, hash11(floor(vUv.y * 60) + floor(time * 8))) * sin(vUv.x * 30 + time * 9);
      value = signal + noise * 0.55 + scan * 0.12 + tear * 0.3;
      detail = smoothstep(0.46, 0.5, fract(block.x * 8 + signal));
    }

    const vignette = smoothstep(0.86, 0.18, radius);
    const hot = clamp(value, 0, 1.8);
    let color = mix(uPrimary.scale(0.08), uPrimary, clamp(hot, 0, 1));
    color = mix(color, uAccent.scale(1.3), clamp(hot - 0.55 + detail * 0.3, 0, 1));
    color = color.add(uAccent.scale(max(hot - 1, 0) * 0.7));
    color = color.scale(vignette).add(uPrimary.scale(0.025));
    return vec4(color, 1);
  },
});
