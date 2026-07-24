/**
 * Typed surface for the brometal/shaders library. These functions are GPU
 * code: the compiler inlines their implementations at build time when
 * imported in a *.shader.ts file — they never execute on the CPU.
 */
import type { Vec2, Vec3 } from '../dsl/types.js';

function gpuOnly(name: string): never {
  throw new Error(
    `BroMetal: ${name}() is a brometal/shaders GPU function and cannot run on the CPU — import it inside a *.shader.ts file compiled by \`npx brometal dev\`.`,
  );
}

// ── Hash ──────────────────────────────────────────────────────────────────
/** Deterministic pseudo-random float in [0, 1) from a float seed. */
export function hash11(p: number): number;
export function hash11(): number {
  return gpuOnly('hash11');
}

/** Deterministic pseudo-random float in [0, 1) from a 2D seed. */
export function hash21(p: Vec2): number;
export function hash21(): number {
  return gpuOnly('hash21');
}

/** Deterministic pseudo-random vec2 in [0, 1)² from a 2D seed. */
export function hash22(p: Vec2): Vec2;
export function hash22(): Vec2 {
  return gpuOnly('hash22');
}

// ── Noise ─────────────────────────────────────────────────────────────────
/** 2D value noise in [0, 1], smooth-interpolated. */
export function vnoise2(p: Vec2): number;
export function vnoise2(): number {
  return gpuOnly('vnoise2');
}

/** Fractal Brownian motion: `octaves` layers of vnoise2, normalized to [0, 1]. */
export function fbm2(p: Vec2, octaves: number): number;
export function fbm2(): number {
  return gpuOnly('fbm2');
}

/** 2D cellular (Voronoi) noise: distance to the nearest feature point. */
export function voronoi2(p: Vec2): number;
export function voronoi2(): number {
  return gpuOnly('voronoi2');
}

// ── Easing (t in [0, 1] → [0, 1]) ─────────────────────────────────────────
export function easeInQuad(t: number): number;
export function easeInQuad(): number {
  return gpuOnly('easeInQuad');
}
export function easeOutQuad(t: number): number;
export function easeOutQuad(): number {
  return gpuOnly('easeOutQuad');
}
export function easeInOutQuad(t: number): number;
export function easeInOutQuad(): number {
  return gpuOnly('easeInOutQuad');
}
export function easeInCubic(t: number): number;
export function easeInCubic(): number {
  return gpuOnly('easeInCubic');
}
export function easeOutCubic(t: number): number;
export function easeOutCubic(): number {
  return gpuOnly('easeOutCubic');
}
export function easeInOutCubic(t: number): number;
export function easeInOutCubic(): number {
  return gpuOnly('easeInOutCubic');
}
export function easeOutElastic(t: number): number;
export function easeOutElastic(): number {
  return gpuOnly('easeOutElastic');
}
export function easeOutBounce(t: number): number;
export function easeOutBounce(): number {
  return gpuOnly('easeOutBounce');
}

// ── Color ─────────────────────────────────────────────────────────────────
/** Rec. 709 luma of a linear RGB color. */
export function luminance(color: Vec3): number;
export function luminance(): number {
  return gpuOnly('luminance');
}

/** HSV (all components 0..1) to RGB. */
export function hsv2rgb(hsv: Vec3): Vec3;
export function hsv2rgb(): Vec3 {
  return gpuOnly('hsv2rgb');
}

/** Iñigo Quilez cosine palette: a + b·cos(2π(c·t + d)). */
export function cosinePalette(t: number, a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3;
export function cosinePalette(): Vec3 {
  return gpuOnly('cosinePalette');
}

/** Narkowicz ACES filmic tonemap, clamped to [0, 1]. */
export function tonemapACES(color: Vec3): Vec3;
export function tonemapACES(): Vec3 {
  return gpuOnly('tonemapACES');
}

/** Linear → gamma-encoded color (typically gamma 2.2). */
export function gammaCorrect(color: Vec3, gamma: number): Vec3;
export function gammaCorrect(): Vec3 {
  return gpuOnly('gammaCorrect');
}

// ── Lighting ──────────────────────────────────────────────────────────────
/** Lambertian diffuse term (inputs are normalized internally). */
export function lambert(normal: Vec3, lightDir: Vec3): number;
export function lambert(): number {
  return gpuOnly('lambert');
}

/** Blinn-Phong specular term with the given shininess exponent. */
export function blinnPhongSpec(normal: Vec3, lightDir: Vec3, viewDir: Vec3, shininess: number): number;
export function blinnPhongSpec(): number {
  return gpuOnly('blinnPhongSpec');
}

/** Fresnel rim term: strongest at grazing view angles. */
export function fresnel(normal: Vec3, viewDir: Vec3, power: number): number;
export function fresnel(): number {
  return gpuOnly('fresnel');
}

/** Sky/ground ambient blended by the normal's upward tilt. */
export function hemisphereLight(normal: Vec3, skyColor: Vec3, groundColor: Vec3): Vec3;
export function hemisphereLight(): Vec3 {
  return gpuOnly('hemisphereLight');
}

// ── 2D transforms ─────────────────────────────────────────────────────────
/** Rotates a 2D point around the origin by `angle` radians. */
export function rotate2(p: Vec2, angle: number): Vec2;
export function rotate2(): Vec2 {
  return gpuOnly('rotate2');
}

// ── Signed distance fields (3D) ───────────────────────────────────────────
/** Signed distance to a sphere of the given radius centered at the origin. */
export function sdSphere3(p: Vec3, radius: number): number;
export function sdSphere3(): number {
  return gpuOnly('sdSphere3');
}

/** Signed distance to an axis-aligned box with the given half extents. */
export function sdBox3(p: Vec3, halfSize: Vec3): number;
export function sdBox3(): number {
  return gpuOnly('sdBox3');
}

/** Signed distance to a torus in the XZ plane: radii = (ring, tube). */
export function sdTorus3(p: Vec3, radii: Vec2): number;
export function sdTorus3(): number {
  return gpuOnly('sdTorus3');
}

// ── Signed distance fields (2D) ───────────────────────────────────────────
/** Signed distance to a circle of the given radius centered at the origin. */
export function sdCircle(p: Vec2, radius: number): number;
export function sdCircle(): number {
  return gpuOnly('sdCircle');
}

/** Signed distance to an axis-aligned box with the given half extents. */
export function sdBox2(p: Vec2, halfSize: Vec2): number;
export function sdBox2(): number {
  return gpuOnly('sdBox2');
}

/** Signed distance to the line segment a→b. */
export function sdSegment2(p: Vec2, a: Vec2, b: Vec2): number;
export function sdSegment2(): number {
  return gpuOnly('sdSegment2');
}

/** Polynomial smooth-min of two distances with blend radius k. */
export function smoothUnion(d1: number, d2: number, k: number): number;
export function smoothUnion(): number {
  return gpuOnly('smoothUnion');
}

/** Antialiased fill: 1 inside the shape, 0 outside, soft over `softness`. */
export function fillAA(d: number, softness: number): number;
export function fillAA(): number {
  return gpuOnly('fillAA');
}

// ── Math utilities ────────────────────────────────────────────────────────
/** Linearly remaps `value` from [inLow, inHigh] to [outLow, outHigh]. */
export function remap(value: number, inLow: number, inHigh: number, outLow: number, outHigh: number): number;
export function remap(): number {
  return gpuOnly('remap');
}

/** Quintic smoothstep — flatter start/end than the built-in. */
export function smootherstep(edge0: number, edge1: number, x: number): number;
export function smootherstep(): number {
  return gpuOnly('smootherstep');
}

// ── Gradient / advanced noise ─────────────────────────────────────────────
/** 2D gradient (Perlin-style) noise in ~[0, 1] — smoother than vnoise2. */
export function gnoise2(p: Vec2): number;
export function gnoise2(): number {
  return gpuOnly('gnoise2');
}

/** Fractal Brownian motion over gradient noise — rounder, less grid-aligned than fbm2. */
export function gfbm2(p: Vec2, octaves: number): number;
export function gfbm2(): number {
  return gpuOnly('gfbm2');
}

/** Ridged/turbulent FBM built from |gnoise2| octaves. */
export function turbulence2(p: Vec2, octaves: number): number;
export function turbulence2(): number {
  return gpuOnly('turbulence2');
}

/** Iñigo Quilez domain warping: fbm fed through fbm, animated by `time`. */
export function warp2(p: Vec2, time: number): number;
export function warp2(): number {
  return gpuOnly('warp2');
}

/** Worley edge distance (F2 − F1): bright cell borders. */
export function worleyEdge2(p: Vec2): number;
export function worleyEdge2(): number {
  return gpuOnly('worleyEdge2');
}

/** Divergence-free 2D curl of gnoise2 — natural flow-field velocities. */
export function curl2(p: Vec2): Vec2;
export function curl2(): Vec2 {
  return gpuOnly('curl2');
}

/** Deterministic pseudo-random float in [0, 1) from a 3D seed. */
export function hash31(p: Vec3): number;
export function hash31(): number {
  return gpuOnly('hash31');
}

/** 3D value noise in [0, 1] — animate surfaces by moving through z. */
export function vnoise3(p: Vec3): number;
export function vnoise3(): number {
  return gpuOnly('vnoise3');
}

/** Fractal Brownian motion over vnoise3. */
export function fbm3(p: Vec3, octaves: number): number;
export function fbm3(): number {
  return gpuOnly('fbm3');
}

// ── Color adjustments & blend modes ───────────────────────────────────────
/** RGB to HSV (all components 0..1) — inverse of hsv2rgb. */
export function rgb2hsv(color: Vec3): Vec3;
export function rgb2hsv(): Vec3 {
  return gpuOnly('rgb2hsv');
}

/** Scales saturation: 0 = greyscale, 1 = unchanged, >1 = boosted. */
export function adjustSaturation(color: Vec3, amount: number): Vec3;
export function adjustSaturation(): Vec3 {
  return gpuOnly('adjustSaturation');
}

/** Brightness offset and contrast scale around mid-grey. */
export function brightnessContrast(color: Vec3, brightness: number, contrast: number): Vec3;
export function brightnessContrast(): Vec3 {
  return gpuOnly('brightnessContrast');
}

/** Screen blend mode: 1 − (1−a)(1−b). */
export function blendScreen(base: Vec3, blend: Vec3): Vec3;
export function blendScreen(): Vec3 {
  return gpuOnly('blendScreen');
}

/** Overlay blend for a single channel. */
export function blendOverlayChannel(base: number, blend: number): number;
export function blendOverlayChannel(): number {
  return gpuOnly('blendOverlayChannel');
}

/** Overlay blend mode. */
export function blendOverlay(base: Vec3, blend: Vec3): Vec3;
export function blendOverlay(): Vec3 {
  return gpuOnly('blendOverlay');
}

/** Reinhard tonemap: c / (1 + c). */
export function tonemapReinhard(color: Vec3): Vec3;
export function tonemapReinhard(): Vec3 {
  return gpuOnly('tonemapReinhard');
}

// ── More easing ───────────────────────────────────────────────────────────
export function easeInOutSine(t: number): number;
export function easeInOutSine(): number {
  return gpuOnly('easeInOutSine');
}
export function easeOutExpo(t: number): number;
export function easeOutExpo(): number {
  return gpuOnly('easeOutExpo');
}
export function easeOutBack(t: number): number;
export function easeOutBack(): number {
  return gpuOnly('easeOutBack');
}

// ── More SDF (2D) ─────────────────────────────────────────────────────────
/** Signed distance to a rounded axis-aligned box. */
export function sdRoundedBox2(p: Vec2, halfSize: Vec2, radius: number): number;
export function sdRoundedBox2(): number {
  return gpuOnly('sdRoundedBox2');
}

/** Signed distance to a regular hexagon (flat-top). */
export function sdHexagon(p: Vec2, radius: number): number;
export function sdHexagon(): number {
  return gpuOnly('sdHexagon');
}

/** Polynomial smooth subtraction of d1 from d2. */
export function smoothSubtract(d1: number, d2: number, k: number): number;
export function smoothSubtract(): number {
  return gpuOnly('smoothSubtract');
}

/** Polynomial smooth intersection. */
export function smoothIntersect(d1: number, d2: number, k: number): number;
export function smoothIntersect(): number {
  return gpuOnly('smoothIntersect');
}

/** Antialiased outline of width `width` along a distance field's zero line. */
export function strokeAA(d: number, width: number, softness: number): number;
export function strokeAA(): number {
  return gpuOnly('strokeAA');
}

// ── More SDF (3D) ─────────────────────────────────────────────────────────
/** Signed distance to a capsule between a and b. */
export function sdCapsule3(p: Vec3, a: Vec3, b: Vec3, radius: number): number;
export function sdCapsule3(): number {
  return gpuOnly('sdCapsule3');
}

/** Signed distance bound for an octahedron. */
export function sdOctahedron3(p: Vec3, size: number): number;
export function sdOctahedron3(): number {
  return gpuOnly('sdOctahedron3');
}

/** Signed distance to a plane with the given normal and offset. */
export function sdPlane3(p: Vec3, normal: Vec3, height: number): number;
export function sdPlane3(): number {
  return gpuOnly('sdPlane3');
}

// ── More lighting ─────────────────────────────────────────────────────────
/** GGX microfacet specular term (roughness in (0, 1]). */
export function specGGX(normal: Vec3, lightDir: Vec3, viewDir: Vec3, roughness: number): number;
export function specGGX(): number {
  return gpuOnly('specGGX');
}

/** Cel/toon-banded diffuse with the given number of bands. */
export function toonShade(normal: Vec3, lightDir: Vec3, bands: number): number;
export function toonShade(): number {
  return gpuOnly('toonShade');
}

// ── Grain ─────────────────────────────────────────────────────────────────
/** Animated film grain in [−0.5, 0.5] — add a scaled amount to the color. */
export function filmGrain(uv: Vec2, time: number): number;
export function filmGrain(): number {
  return gpuOnly('filmGrain');
}

// ── 3D transforms ─────────────────────────────────────────────────────────
/** Rotates a 3D point around `axis` (normalized internally) by `angle` radians. */
export function rotate3(p: Vec3, axis: Vec3, angle: number): Vec3;
export function rotate3(): Vec3 {
  return gpuOnly('rotate3');
}

// ── Waves ─────────────────────────────────────────────────────────────────
/** Gerstner wave displacement for point `p` at `time` — xy shifts the point along `dir`, z is height. */
export function gerstnerWave(p: Vec2, dir: Vec2, steepness: number, wavelength: number, time: number): Vec3;
export function gerstnerWave(): Vec3 {
  return gpuOnly('gerstnerWave');
}
