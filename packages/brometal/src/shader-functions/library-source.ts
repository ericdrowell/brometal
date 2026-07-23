/**
 * The brometal/shaders library: each entry is DSL source for one helper
 * function, inlined into a shader's compilation when imported via
 * `import { name } from 'brometal/shaders'`. Only imported functions (and
 * their deps) are compiled; only *called* functions are emitted.
 *
 * Sources must stay within the DSL subset (no ternaries, no early returns,
 * one declaration per statement, float-only intrinsics applied per component).
 */

export interface LibraryEntry {
  source: string;
  deps: readonly string[];
}

export const SHADER_LIBRARY: Record<string, LibraryEntry> = {
  // ── Hash ────────────────────────────────────────────────────────────────
  hash11: {
    deps: [],
    source: `function hash11(p: number): number {
  return fract(sin(p * 127.1) * 43758.5453);
}`,
  },
  hash21: {
    deps: [],
    source: `function hash21(p: Vec2): number {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}`,
  },
  hash22: {
    deps: [],
    source: `function hash22(p: Vec2): Vec2 {
  const k = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return vec2(fract(sin(k.x) * 43758.5453), fract(sin(k.y) * 43758.5453));
}`,
  },

  // ── Noise ───────────────────────────────────────────────────────────────
  vnoise2: {
    deps: ['hash21'],
    source: `function vnoise2(p: Vec2): number {
  const cell = vec2(floor(p.x), floor(p.y));
  const f = p.sub(cell);
  const u = vec2(f.x * f.x * (3 - 2 * f.x), f.y * f.y * (3 - 2 * f.y));
  const a = hash21(cell);
  const b = hash21(cell.add(vec2(1, 0)));
  const c = hash21(cell.add(vec2(0, 1)));
  const d = hash21(cell.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`,
  },
  fbm2: {
    deps: ['vnoise2'],
    source: `function fbm2(p: Vec2, octaves: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += amplitude * vnoise2(p.scale(frequency));
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / norm;
}`,
  },
  voronoi2: {
    deps: ['hash22'],
    source: `function voronoi2(p: Vec2): number {
  const cell = vec2(floor(p.x), floor(p.y));
  const f = p.sub(cell);
  let minDist = 8;
  for (let i = -1; i <= 1; i += 1) {
    for (let j = -1; j <= 1; j += 1) {
      const neighbor = vec2(i, j);
      const feature = hash22(cell.add(neighbor));
      const diff = neighbor.add(feature).sub(f);
      minDist = min(minDist, length(diff));
    }
  }
  return minDist;
}`,
  },

  // ── Easing ──────────────────────────────────────────────────────────────
  easeInQuad: {
    deps: [],
    source: `function easeInQuad(t: number): number {
  return t * t;
}`,
  },
  easeOutQuad: {
    deps: [],
    source: `function easeOutQuad(t: number): number {
  return t * (2 - t);
}`,
  },
  easeInOutQuad: {
    deps: [],
    source: `function easeInOutQuad(t: number): number {
  let result = 2 * t * t;
  if (t >= 0.5) {
    const inv = 2 - 2 * t;
    result = 1 - inv * inv * 0.5;
  }
  return result;
}`,
  },
  easeInCubic: {
    deps: [],
    source: `function easeInCubic(t: number): number {
  return t * t * t;
}`,
  },
  easeOutCubic: {
    deps: [],
    source: `function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}`,
  },
  easeInOutCubic: {
    deps: [],
    source: `function easeInOutCubic(t: number): number {
  let result = 4 * t * t * t;
  if (t >= 0.5) {
    const inv = 2 - 2 * t;
    result = 1 - inv * inv * inv * 0.5;
  }
  return result;
}`,
  },
  easeOutElastic: {
    deps: [],
    source: `function easeOutElastic(t: number): number {
  const c4 = 2.0943951;
  let result = pow(2, -10 * t) * sin((t * 10 - 0.75) * c4) + 1;
  if (t <= 0) {
    result = 0;
  }
  if (t >= 1) {
    result = 1;
  }
  return result;
}`,
  },
  easeOutBounce: {
    deps: [],
    source: `function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  let result = 0;
  if (t < 0.36363636) {
    result = n1 * t * t;
  } else {
    if (t < 0.72727272) {
      const t2 = t - 0.54545454;
      result = n1 * t2 * t2 + 0.75;
    } else {
      if (t < 0.90909090) {
        const t3 = t - 0.81818181;
        result = n1 * t3 * t3 + 0.9375;
      } else {
        const t4 = t - 0.95454545;
        result = n1 * t4 * t4 + 0.984375;
      }
    }
  }
  return result;
}`,
  },

  // ── Color ───────────────────────────────────────────────────────────────
  luminance: {
    deps: [],
    source: `function luminance(color: Vec3): number {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}`,
  },
  hsv2rgb: {
    deps: [],
    source: `function hsv2rgb(hsv: Vec3): Vec3 {
  const h = hsv.x * 6;
  const r = clamp(abs(h - 3) - 1, 0, 1);
  const g = clamp(2 - abs(h - 2), 0, 1);
  const b = clamp(2 - abs(h - 4), 0, 1);
  return mix(vec3(1, 1, 1), vec3(r, g, b), hsv.y).mul(hsv.z);
}`,
  },
  cosinePalette: {
    deps: [],
    source: `function cosinePalette(t: number, a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 {
  const phase = c.scale(t).add(d).scale(6.28318);
  return a.add(vec3(cos(phase.x), cos(phase.y), cos(phase.z)).mul(b));
}`,
  },
  tonemapACES: {
    deps: [],
    source: `function tonemapACES(color: Vec3): Vec3 {
  const num = color.mul(color.scale(2.51).add(vec3(0.03, 0.03, 0.03)));
  const den = color.mul(color.scale(2.43).add(vec3(0.59, 0.59, 0.59))).add(vec3(0.14, 0.14, 0.14));
  return clamp(num.div(den), 0, 1);
}`,
  },
  gammaCorrect: {
    deps: [],
    source: `function gammaCorrect(color: Vec3, gamma: number): Vec3 {
  const inv = 1 / gamma;
  return vec3(pow(color.x, inv), pow(color.y, inv), pow(color.z, inv));
}`,
  },

  // ── Lighting ────────────────────────────────────────────────────────────
  lambert: {
    deps: [],
    source: `function lambert(normal: Vec3, lightDir: Vec3): number {
  return max(dot(normalize(normal), normalize(lightDir)), 0);
}`,
  },
  blinnPhongSpec: {
    deps: [],
    source: `function blinnPhongSpec(normal: Vec3, lightDir: Vec3, viewDir: Vec3, shininess: number): number {
  const halfway = normalize(normalize(lightDir).add(normalize(viewDir)));
  return pow(max(dot(normalize(normal), halfway), 0), shininess);
}`,
  },
  fresnel: {
    deps: [],
    source: `function fresnel(normal: Vec3, viewDir: Vec3, power: number): number {
  const base = 1 - max(dot(normalize(normal), normalize(viewDir)), 0);
  return pow(base, power);
}`,
  },
  hemisphereLight: {
    deps: [],
    source: `function hemisphereLight(normal: Vec3, skyColor: Vec3, groundColor: Vec3): Vec3 {
  const blend = normalize(normal).y * 0.5 + 0.5;
  return mix(groundColor, skyColor, blend);
}`,
  },

  // ── 2D transforms ───────────────────────────────────────────────────────
  rotate2: {
    deps: [],
    source: `function rotate2(p: Vec2, angle: number): Vec2 {
  const c = cos(angle);
  const s = sin(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}`,
  },

  // ── SDF (3D) ────────────────────────────────────────────────────────────
  sdSphere3: {
    deps: [],
    source: `function sdSphere3(p: Vec3, radius: number): number {
  return length(p) - radius;
}`,
  },
  sdBox3: {
    deps: [],
    source: `function sdBox3(p: Vec3, halfSize: Vec3): number {
  const d = vec3(abs(p.x) - halfSize.x, abs(p.y) - halfSize.y, abs(p.z) - halfSize.z);
  const outside = length(vec3(max(d.x, 0), max(d.y, 0), max(d.z, 0)));
  return outside + min(max(d.x, max(d.y, d.z)), 0);
}`,
  },
  sdTorus3: {
    deps: [],
    source: `function sdTorus3(p: Vec3, radii: Vec2): number {
  const q = vec2(length(p.xz) - radii.x, p.y);
  return length(q) - radii.y;
}`,
  },

  // ── SDF (2D) ────────────────────────────────────────────────────────────
  sdCircle: {
    deps: [],
    source: `function sdCircle(p: Vec2, radius: number): number {
  return length(p) - radius;
}`,
  },
  sdBox2: {
    deps: [],
    source: `function sdBox2(p: Vec2, halfSize: Vec2): number {
  const d = vec2(abs(p.x) - halfSize.x, abs(p.y) - halfSize.y);
  const outside = length(vec2(max(d.x, 0), max(d.y, 0)));
  return outside + min(max(d.x, d.y), 0);
}`,
  },
  sdSegment2: {
    deps: [],
    source: `function sdSegment2(p: Vec2, a: Vec2, b: Vec2): number {
  const pa = p.sub(a);
  const ba = b.sub(a);
  const h = clamp(dot(pa, ba) / dot(ba, ba), 0, 1);
  return length(pa.sub(ba.scale(h)));
}`,
  },
  smoothUnion: {
    deps: [],
    source: `function smoothUnion(d1: number, d2: number, k: number): number {
  const h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0, 1);
  return mix(d2, d1, h) - k * h * (1 - h);
}`,
  },
  fillAA: {
    deps: [],
    source: `function fillAA(d: number, softness: number): number {
  return 1 - smoothstep(0, softness, d);
}`,
  },

  // ── Math utilities ──────────────────────────────────────────────────────
  remap: {
    deps: [],
    source: `function remap(value: number, inLow: number, inHigh: number, outLow: number, outHigh: number): number {
  return outLow + (value - inLow) / (inHigh - inLow) * (outHigh - outLow);
}`,
  },
  smootherstep: {
    deps: [],
    source: `function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}`,
  },

  // ── Gradient / advanced noise ───────────────────────────────────────────
  gnoise2: {
    deps: ['hash22'],
    source: `function gnoise2(p: Vec2): number {
  const cell = vec2(floor(p.x), floor(p.y));
  const f = p.sub(cell);
  const u = vec2(f.x * f.x * f.x * (f.x * (f.x * 6 - 15) + 10), f.y * f.y * f.y * (f.y * (f.y * 6 - 15) + 10));
  const ga = hash22(cell).scale(2).sub(vec2(1, 1));
  const gb = hash22(cell.add(vec2(1, 0))).scale(2).sub(vec2(1, 1));
  const gc = hash22(cell.add(vec2(0, 1))).scale(2).sub(vec2(1, 1));
  const gd = hash22(cell.add(vec2(1, 1))).scale(2).sub(vec2(1, 1));
  const va = dot(ga, f);
  const vb = dot(gb, f.sub(vec2(1, 0)));
  const vc = dot(gc, f.sub(vec2(0, 1)));
  const vd = dot(gd, f.sub(vec2(1, 1)));
  return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y) * 0.7 + 0.5;
}`,
  },
  turbulence2: {
    deps: ['gnoise2'],
    source: `function turbulence2(p: Vec2, octaves: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += amplitude * abs(gnoise2(p.scale(frequency)) * 2 - 1);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / norm;
}`,
  },
  warp2: {
    deps: ['fbm2'],
    source: `function warp2(p: Vec2, time: number): number {
  const q = vec2(fbm2(p, 4), fbm2(p.add(vec2(5.2, 1.3)), 4));
  const shifted = p.add(q.scale(2));
  const r = vec2(fbm2(shifted.add(vec2(1.7, 9.2 + time * 0.15)), 4), fbm2(shifted.add(vec2(8.3 - time * 0.126, 2.8)), 4));
  return fbm2(p.add(r.scale(2)), 4);
}`,
  },
  worleyEdge2: {
    deps: ['hash22'],
    source: `function worleyEdge2(p: Vec2): number {
  const cell = vec2(floor(p.x), floor(p.y));
  const f = p.sub(cell);
  let f1 = 8;
  let f2 = 8;
  for (let i = -1; i <= 1; i += 1) {
    for (let j = -1; j <= 1; j += 1) {
      const neighbor = vec2(i, j);
      const feature = hash22(cell.add(neighbor));
      const d = length(neighbor.add(feature).sub(f));
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else {
        if (d < f2) {
          f2 = d;
        }
      }
    }
  }
  return f2 - f1;
}`,
  },
  curl2: {
    deps: ['gnoise2'],
    source: `function curl2(p: Vec2): Vec2 {
  const e = 0.01;
  const dx = gnoise2(p.add(vec2(e, 0))) - gnoise2(p.sub(vec2(e, 0)));
  const dy = gnoise2(p.add(vec2(0, e))) - gnoise2(p.sub(vec2(0, e)));
  return vec2(dy, -dx).scale(1 / (2 * e));
}`,
  },
  hash31: {
    deps: [],
    source: `function hash31(p: Vec3): number {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}`,
  },
  vnoise3: {
    deps: ['hash31'],
    source: `function vnoise3(p: Vec3): number {
  const cell = vec3(floor(p.x), floor(p.y), floor(p.z));
  const f = p.sub(cell);
  const u = vec3(f.x * f.x * (3 - 2 * f.x), f.y * f.y * (3 - 2 * f.y), f.z * f.z * (3 - 2 * f.z));
  const n000 = hash31(cell);
  const n100 = hash31(cell.add(vec3(1, 0, 0)));
  const n010 = hash31(cell.add(vec3(0, 1, 0)));
  const n110 = hash31(cell.add(vec3(1, 1, 0)));
  const n001 = hash31(cell.add(vec3(0, 0, 1)));
  const n101 = hash31(cell.add(vec3(1, 0, 1)));
  const n011 = hash31(cell.add(vec3(0, 1, 1)));
  const n111 = hash31(cell.add(vec3(1, 1, 1)));
  const nx00 = mix(n000, n100, u.x);
  const nx10 = mix(n010, n110, u.x);
  const nx01 = mix(n001, n101, u.x);
  const nx11 = mix(n011, n111, u.x);
  const nxy0 = mix(nx00, nx10, u.y);
  const nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
}`,
  },
  fbm3: {
    deps: ['vnoise3'],
    source: `function fbm3(p: Vec3, octaves: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += amplitude * vnoise3(p.scale(frequency));
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / norm;
}`,
  },

  // ── Color adjustments & blend modes ─────────────────────────────────────
  rgb2hsv: {
    deps: [],
    source: `function rgb2hsv(color: Vec3): Vec3 {
  const maxc = max(color.x, max(color.y, color.z));
  const minc = min(color.x, min(color.y, color.z));
  const delta = maxc - minc;
  let h = 0;
  if (delta > 0.00001) {
    if (color.x >= maxc - 0.00001) {
      h = (color.y - color.z) / delta;
      h = (h - floor(h / 6) * 6) / 6;
    } else {
      if (color.y >= maxc - 0.00001) {
        h = ((color.z - color.x) / delta + 2) / 6;
      } else {
        h = ((color.x - color.y) / delta + 4) / 6;
      }
    }
  }
  let s = 0;
  if (maxc > 0.00001) {
    s = delta / maxc;
  }
  return vec3(h, s, maxc);
}`,
  },
  adjustSaturation: {
    deps: ['luminance'],
    source: `function adjustSaturation(color: Vec3, amount: number): Vec3 {
  const grey = luminance(color);
  return mix(vec3(grey, grey, grey), color, amount);
}`,
  },
  brightnessContrast: {
    deps: [],
    source: `function brightnessContrast(color: Vec3, brightness: number, contrast: number): Vec3 {
  return color.sub(vec3(0.5, 0.5, 0.5)).scale(contrast).add(vec3(0.5, 0.5, 0.5)).add(vec3(brightness, brightness, brightness));
}`,
  },
  blendScreen: {
    deps: [],
    source: `function blendScreen(base: Vec3, blend: Vec3): Vec3 {
  return vec3(1, 1, 1).sub(vec3(1, 1, 1).sub(base).mul(vec3(1, 1, 1).sub(blend)));
}`,
  },
  blendOverlayChannel: {
    deps: [],
    source: `function blendOverlayChannel(base: number, blend: number): number {
  let result = 2 * base * blend;
  if (base >= 0.5) {
    result = 1 - 2 * (1 - base) * (1 - blend);
  }
  return result;
}`,
  },
  blendOverlay: {
    deps: ['blendOverlayChannel'],
    source: `function blendOverlay(base: Vec3, blend: Vec3): Vec3 {
  return vec3(blendOverlayChannel(base.x, blend.x), blendOverlayChannel(base.y, blend.y), blendOverlayChannel(base.z, blend.z));
}`,
  },
  tonemapReinhard: {
    deps: [],
    source: `function tonemapReinhard(color: Vec3): Vec3 {
  return color.div(color.add(vec3(1, 1, 1)));
}`,
  },

  // ── More easing ─────────────────────────────────────────────────────────
  easeInOutSine: {
    deps: [],
    source: `function easeInOutSine(t: number): number {
  return (1 - cos(3.14159265 * t)) * 0.5;
}`,
  },
  easeOutExpo: {
    deps: [],
    source: `function easeOutExpo(t: number): number {
  let result = 1 - pow(2, -10 * t);
  if (t >= 1) {
    result = 1;
  }
  return result;
}`,
  },
  easeOutBack: {
    deps: [],
    source: `function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}`,
  },

  // ── More SDF (2D) ───────────────────────────────────────────────────────
  sdRoundedBox2: {
    deps: ['sdBox2'],
    source: `function sdRoundedBox2(p: Vec2, halfSize: Vec2, radius: number): number {
  return sdBox2(p, vec2(halfSize.x - radius, halfSize.y - radius)) - radius;
}`,
  },
  sdHexagon: {
    deps: [],
    source: `function sdHexagon(p: Vec2, radius: number): number {
  const kx = -0.866025404;
  const ky = 0.5;
  const kz = 0.577350269;
  const q = vec2(abs(p.x), abs(p.y));
  const shift = 2 * min(dot(vec2(kx, ky), q), 0);
  const q2 = q.sub(vec2(kx, ky).scale(shift));
  const q3 = vec2(q2.x - clamp(q2.x, -kz * radius, kz * radius), q2.y - radius);
  return length(q3) * sign(q3.y);
}`,
  },
  smoothSubtract: {
    deps: [],
    source: `function smoothSubtract(d1: number, d2: number, k: number): number {
  const h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0, 1);
  return mix(d2, -d1, h) + k * h * (1 - h);
}`,
  },
  smoothIntersect: {
    deps: [],
    source: `function smoothIntersect(d1: number, d2: number, k: number): number {
  const h = clamp(0.5 - 0.5 * (d2 - d1) / k, 0, 1);
  return mix(d2, d1, h) + k * h * (1 - h);
}`,
  },
  strokeAA: {
    deps: [],
    source: `function strokeAA(d: number, width: number, softness: number): number {
  return 1 - smoothstep(width - softness, width + softness, abs(d));
}`,
  },

  // ── More SDF (3D) ───────────────────────────────────────────────────────
  sdCapsule3: {
    deps: [],
    source: `function sdCapsule3(p: Vec3, a: Vec3, b: Vec3, radius: number): number {
  const pa = p.sub(a);
  const ba = b.sub(a);
  const h = clamp(dot(pa, ba) / dot(ba, ba), 0, 1);
  return length(pa.sub(ba.scale(h))) - radius;
}`,
  },
  sdOctahedron3: {
    deps: [],
    source: `function sdOctahedron3(p: Vec3, size: number): number {
  return (abs(p.x) + abs(p.y) + abs(p.z) - size) * 0.57735027;
}`,
  },
  sdPlane3: {
    deps: [],
    source: `function sdPlane3(p: Vec3, normal: Vec3, height: number): number {
  return dot(p, normalize(normal)) + height;
}`,
  },

  // ── More lighting ───────────────────────────────────────────────────────
  specGGX: {
    deps: [],
    source: `function specGGX(normal: Vec3, lightDir: Vec3, viewDir: Vec3, roughness: number): number {
  const n = normalize(normal);
  const halfway = normalize(normalize(lightDir).add(normalize(viewDir)));
  const ndoth = max(dot(n, halfway), 0);
  const a = roughness * roughness;
  const a2 = a * a;
  const denom = ndoth * ndoth * (a2 - 1) + 1;
  const ndf = a2 / (3.14159265 * denom * denom);
  const ndotl = max(dot(n, normalize(lightDir)), 0);
  return ndf * ndotl * 0.25;
}`,
  },
  toonShade: {
    deps: [],
    source: `function toonShade(normal: Vec3, lightDir: Vec3, bands: number): number {
  const diffuse = max(dot(normalize(normal), normalize(lightDir)), 0);
  return clamp(floor(diffuse * bands) / (bands - 1), 0, 1);
}`,
  },

  // ── Grain ───────────────────────────────────────────────────────────────
  filmGrain: {
    deps: ['hash21'],
    source: `function filmGrain(uv: Vec2, time: number): number {
  return hash21(uv.scale(997).add(vec2(fract(time * 13.37) * 100, 0))) - 0.5;
}`,
  },
};

export const SHADER_LIBRARY_NAMES = Object.keys(SHADER_LIBRARY);
