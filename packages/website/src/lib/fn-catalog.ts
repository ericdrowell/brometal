/* Generated — one visual example per brometal/shader-functions export. */
import type { CompiledShader, GpuRecord } from 'brometal';
import hash11Example from '@/shaders/fns/fn-hash11.shader.gen';
import hash21Example from '@/shaders/fns/fn-hash21.shader.gen';
import hash22Example from '@/shaders/fns/fn-hash22.shader.gen';
import hash31Example from '@/shaders/fns/fn-hash31.shader.gen';
import vnoise2Example from '@/shaders/fns/fn-vnoise2.shader.gen';
import gnoise2Example from '@/shaders/fns/fn-gnoise2.shader.gen';
import fbm2Example from '@/shaders/fns/fn-fbm2.shader.gen';
import gfbm2Example from '@/shaders/fns/fn-gfbm2.shader.gen';
import turbulence2Example from '@/shaders/fns/fn-turbulence2.shader.gen';
import warp2Example from '@/shaders/fns/fn-warp2.shader.gen';
import voronoi2Example from '@/shaders/fns/fn-voronoi2.shader.gen';
import worleyEdge2Example from '@/shaders/fns/fn-worleyEdge2.shader.gen';
import curl2Example from '@/shaders/fns/fn-curl2.shader.gen';
import vnoise3Example from '@/shaders/fns/fn-vnoise3.shader.gen';
import fbm3Example from '@/shaders/fns/fn-fbm3.shader.gen';
import easeInQuadExample from '@/shaders/fns/fn-easeInQuad.shader.gen';
import easeOutQuadExample from '@/shaders/fns/fn-easeOutQuad.shader.gen';
import easeInOutQuadExample from '@/shaders/fns/fn-easeInOutQuad.shader.gen';
import easeInCubicExample from '@/shaders/fns/fn-easeInCubic.shader.gen';
import easeOutCubicExample from '@/shaders/fns/fn-easeOutCubic.shader.gen';
import easeInOutCubicExample from '@/shaders/fns/fn-easeInOutCubic.shader.gen';
import easeInOutSineExample from '@/shaders/fns/fn-easeInOutSine.shader.gen';
import easeOutExpoExample from '@/shaders/fns/fn-easeOutExpo.shader.gen';
import easeOutBackExample from '@/shaders/fns/fn-easeOutBack.shader.gen';
import easeOutElasticExample from '@/shaders/fns/fn-easeOutElastic.shader.gen';
import easeOutBounceExample from '@/shaders/fns/fn-easeOutBounce.shader.gen';
import remapExample from '@/shaders/fns/fn-remap.shader.gen';
import smootherstepExample from '@/shaders/fns/fn-smootherstep.shader.gen';
import rotate2Example from '@/shaders/fns/fn-rotate2.shader.gen';
import rotate3Example from '@/shaders/fns/fn-rotate3.shader.gen';
import gerstnerWaveExample from '@/shaders/fns/fn-gerstnerWave.shader.gen';
import luminanceExample from '@/shaders/fns/fn-luminance.shader.gen';
import hsv2rgbExample from '@/shaders/fns/fn-hsv2rgb.shader.gen';
import rgb2hsvExample from '@/shaders/fns/fn-rgb2hsv.shader.gen';
import cosinePaletteExample from '@/shaders/fns/fn-cosinePalette.shader.gen';
import adjustSaturationExample from '@/shaders/fns/fn-adjustSaturation.shader.gen';
import brightnessContrastExample from '@/shaders/fns/fn-brightnessContrast.shader.gen';
import blendScreenExample from '@/shaders/fns/fn-blendScreen.shader.gen';
import blendOverlayChannelExample from '@/shaders/fns/fn-blendOverlayChannel.shader.gen';
import blendOverlayExample from '@/shaders/fns/fn-blendOverlay.shader.gen';
import tonemapACESExample from '@/shaders/fns/fn-tonemapACES.shader.gen';
import tonemapReinhardExample from '@/shaders/fns/fn-tonemapReinhard.shader.gen';
import gammaCorrectExample from '@/shaders/fns/fn-gammaCorrect.shader.gen';
import filmGrainExample from '@/shaders/fns/fn-filmGrain.shader.gen';
import lambertExample from '@/shaders/fns/fn-lambert.shader.gen';
import blinnPhongSpecExample from '@/shaders/fns/fn-blinnPhongSpec.shader.gen';
import specGGXExample from '@/shaders/fns/fn-specGGX.shader.gen';
import fresnelExample from '@/shaders/fns/fn-fresnel.shader.gen';
import toonShadeExample from '@/shaders/fns/fn-toonShade.shader.gen';
import hemisphereLightExample from '@/shaders/fns/fn-hemisphereLight.shader.gen';
import sdCircleExample from '@/shaders/fns/fn-sdCircle.shader.gen';
import sdBox2Example from '@/shaders/fns/fn-sdBox2.shader.gen';
import sdRoundedBox2Example from '@/shaders/fns/fn-sdRoundedBox2.shader.gen';
import sdHexagonExample from '@/shaders/fns/fn-sdHexagon.shader.gen';
import sdSegment2Example from '@/shaders/fns/fn-sdSegment2.shader.gen';
import smoothUnionExample from '@/shaders/fns/fn-smoothUnion.shader.gen';
import smoothSubtractExample from '@/shaders/fns/fn-smoothSubtract.shader.gen';
import smoothIntersectExample from '@/shaders/fns/fn-smoothIntersect.shader.gen';
import fillAAExample from '@/shaders/fns/fn-fillAA.shader.gen';
import strokeAAExample from '@/shaders/fns/fn-strokeAA.shader.gen';
import sdSphere3Example from '@/shaders/fns/fn-sdSphere3.shader.gen';
import sdBox3Example from '@/shaders/fns/fn-sdBox3.shader.gen';
import sdTorus3Example from '@/shaders/fns/fn-sdTorus3.shader.gen';
import sdCapsule3Example from '@/shaders/fns/fn-sdCapsule3.shader.gen';
import sdOctahedron3Example from '@/shaders/fns/fn-sdOctahedron3.shader.gen';
import sdPlane3Example from '@/shaders/fns/fn-sdPlane3.shader.gen';

export interface FnExample {
  key: string;
  category: string;
  signature: string;
  doc: string;
  shader: CompiledShader<GpuRecord, GpuRecord, GpuRecord>;
}

export const FN_CATEGORY_ORDER = ["Hash & Noise", "Easing", "Math & Transforms", "Color", "Lighting", "SDF 2D", "SDF 3D"];

export const FN_EXAMPLES: FnExample[] = [
  {
    key: 'hash11',
    category: 'Hash & Noise',
    signature: "hash11(p: number): number",
    doc: "Pseudo-random float from a float seed \u2014 shown as random columns.",
    shader: hash11Example,
  },
  {
    key: 'hash21',
    category: 'Hash & Noise',
    signature: "hash21(p: Vec2): number",
    doc: "Pseudo-random float from a 2D seed \u2014 one value per cell.",
    shader: hash21Example,
  },
  {
    key: 'hash22',
    category: 'Hash & Noise',
    signature: "hash22(p: Vec2): Vec2",
    doc: "Pseudo-random vec2 per cell \u2014 shown as red/green channels.",
    shader: hash22Example,
  },
  {
    key: 'hash31',
    category: 'Hash & Noise',
    signature: "hash31(p: Vec3): number",
    doc: "Pseudo-random float from a 3D seed \u2014 z animates the cells.",
    shader: hash31Example,
  },
  {
    key: 'vnoise2',
    category: 'Hash & Noise',
    signature: "vnoise2(p: Vec2): number",
    doc: "Smooth-interpolated 2D value noise.",
    shader: vnoise2Example,
  },
  {
    key: 'gnoise2',
    category: 'Hash & Noise',
    signature: "gnoise2(p: Vec2): number",
    doc: "Gradient (Perlin-style) noise \u2014 smoother, less blocky than value noise.",
    shader: gnoise2Example,
  },
  {
    key: 'fbm2',
    category: 'Hash & Noise',
    signature: "fbm2(p: Vec2, octaves: number): number",
    doc: "Fractal Brownian motion: layered octaves of value noise.",
    shader: fbm2Example,
  },
  {
    key: 'gfbm2',
    category: 'Hash & Noise',
    signature: "gfbm2(p: Vec2, octaves: number): number",
    doc: "FBM over gradient noise — rounder, less grid-aligned than fbm2.",
    shader: gfbm2Example,
  },
  {
    key: 'turbulence2',
    category: 'Hash & Noise',
    signature: "turbulence2(p: Vec2, octaves: number): number",
    doc: "Ridged FBM built from folded gradient-noise octaves.",
    shader: turbulence2Example,
  },
  {
    key: 'warp2',
    category: 'Hash & Noise',
    signature: "warp2(p: Vec2, time: number): number",
    doc: "Domain warping: fbm fed through fbm \u2014 fluid, marbled fields.",
    shader: warp2Example,
  },
  {
    key: 'voronoi2',
    category: 'Hash & Noise',
    signature: "voronoi2(p: Vec2): number",
    doc: "Distance to the nearest cellular feature point.",
    shader: voronoi2Example,
  },
  {
    key: 'worleyEdge2',
    category: 'Hash & Noise',
    signature: "worleyEdge2(p: Vec2): number",
    doc: "F2 \u2212 F1 cellular distance: bright at cell borders.",
    shader: worleyEdge2Example,
  },
  {
    key: 'curl2',
    category: 'Hash & Noise',
    signature: "curl2(p: Vec2): Vec2",
    doc: "Divergence-free curl of gradient noise \u2014 flow-field velocities as color.",
    shader: curl2Example,
  },
  {
    key: 'vnoise3',
    category: 'Hash & Noise',
    signature: "vnoise3(p: Vec3): number",
    doc: "3D value noise \u2014 the third axis animates the field.",
    shader: vnoise3Example,
  },
  {
    key: 'fbm3',
    category: 'Hash & Noise',
    signature: "fbm3(p: Vec3, octaves: number): number",
    doc: "3D fractal noise \u2014 evolving clouds without any drift.",
    shader: fbm3Example,
  },
  {
    key: 'easeInQuad',
    category: 'Easing',
    signature: "easeInQuad(t: number): number",
    doc: "Accelerating from zero: t\u00b2. Curve plus a dot animating along it.",
    shader: easeInQuadExample,
  },
  {
    key: 'easeOutQuad',
    category: 'Easing',
    signature: "easeOutQuad(t: number): number",
    doc: "Decelerating to rest: t(2\u2212t). Curve plus a dot animating along it.",
    shader: easeOutQuadExample,
  },
  {
    key: 'easeInOutQuad',
    category: 'Easing',
    signature: "easeInOutQuad(t: number): number",
    doc: "Accelerate then decelerate, quadratic. Curve plus a dot animating along it.",
    shader: easeInOutQuadExample,
  },
  {
    key: 'easeInCubic',
    category: 'Easing',
    signature: "easeInCubic(t: number): number",
    doc: "Accelerating from zero: t\u00b3. Curve plus a dot animating along it.",
    shader: easeInCubicExample,
  },
  {
    key: 'easeOutCubic',
    category: 'Easing',
    signature: "easeOutCubic(t: number): number",
    doc: "Decelerating to rest, cubic. Curve plus a dot animating along it.",
    shader: easeOutCubicExample,
  },
  {
    key: 'easeInOutCubic',
    category: 'Easing',
    signature: "easeInOutCubic(t: number): number",
    doc: "Accelerate then decelerate, cubic. Curve plus a dot animating along it.",
    shader: easeInOutCubicExample,
  },
  {
    key: 'easeInOutSine',
    category: 'Easing',
    signature: "easeInOutSine(t: number): number",
    doc: "Gentle sinusoidal ease in and out. Curve plus a dot animating along it.",
    shader: easeInOutSineExample,
  },
  {
    key: 'easeOutExpo',
    category: 'Easing',
    signature: "easeOutExpo(t: number): number",
    doc: "Exponential decay to rest. Curve plus a dot animating along it.",
    shader: easeOutExpoExample,
  },
  {
    key: 'easeOutBack',
    category: 'Easing',
    signature: "easeOutBack(t: number): number",
    doc: "Overshoots the target, then settles. Curve plus a dot animating along it.",
    shader: easeOutBackExample,
  },
  {
    key: 'easeOutElastic',
    category: 'Easing',
    signature: "easeOutElastic(t: number): number",
    doc: "Springs past the target with damped oscillation. Curve plus a dot animating along it.",
    shader: easeOutElasticExample,
  },
  {
    key: 'easeOutBounce',
    category: 'Easing',
    signature: "easeOutBounce(t: number): number",
    doc: "Bounces to rest like a dropped ball. Curve plus a dot animating along it.",
    shader: easeOutBounceExample,
  },
  {
    key: 'remap',
    category: 'Math & Transforms',
    signature: "remap(value, inLow, inHigh, outLow, outHigh): number",
    doc: "Range conversion \u2014 bottom strip stretches the middle of the top gradient.",
    shader: remapExample,
  },
  {
    key: 'smootherstep',
    category: 'Math & Transforms',
    signature: "smootherstep(edge0, edge1, x): number",
    doc: "Quintic smoothstep \u2014 flatter start and end than the cubic built-in.",
    shader: smootherstepExample,
  },
  {
    key: 'rotate2',
    category: 'Math & Transforms',
    signature: "rotate2(p: Vec2, angle: number): Vec2",
    doc: "Rotates 2D points around the origin \u2014 spinning a checker grid.",
    shader: rotate2Example,
  },
  {
    key: 'rotate3',
    category: 'Math & Transforms',
    signature: "rotate3(p: Vec3, axis: Vec3, angle: number): Vec3",
    doc: "Rotates 3D points around an arbitrary axis \u2014 a checkered ball spinning on a tilt.",
    shader: rotate3Example,
  },
  {
    key: 'gerstnerWave',
    category: 'Math & Transforms',
    signature: "gerstnerWave(p: Vec2, dir: Vec2, steepness, wavelength, time): Vec3",
    doc: "Gerstner ocean wave displacement \u2014 two crossing wave trains, colored by height.",
    shader: gerstnerWaveExample,
  },
  {
    key: 'luminance',
    category: 'Color',
    signature: "luminance(color: Vec3): number",
    doc: "Rec. 709 luma \u2014 right half shows the greyscale of the left.",
    shader: luminanceExample,
  },
  {
    key: 'hsv2rgb',
    category: 'Color',
    signature: "hsv2rgb(hsv: Vec3): Vec3",
    doc: "Hue across x, saturation across y, full value.",
    shader: hsv2rgbExample,
  },
  {
    key: 'rgb2hsv',
    category: 'Color',
    signature: "rgb2hsv(color: Vec3): Vec3",
    doc: "Top: source colors. Bottom: their H, S, V shown as R, G, B.",
    shader: rgb2hsvExample,
  },
  {
    key: 'cosinePalette',
    category: 'Color',
    signature: "cosinePalette(t, a, b, c, d): Vec3",
    doc: "I\u00f1igo Quilez cosine palette sweeping over t.",
    shader: cosinePaletteExample,
  },
  {
    key: 'adjustSaturation',
    category: 'Color',
    signature: "adjustSaturation(color, amount): Vec3",
    doc: "Saturation animates from greyscale (0) through normal (1) to boosted (2).",
    shader: adjustSaturationExample,
  },
  {
    key: 'brightnessContrast',
    category: 'Color',
    signature: "brightnessContrast(color, brightness, contrast): Vec3",
    doc: "Contrast animates around mid-grey on a hue strip.",
    shader: brightnessContrastExample,
  },
  {
    key: 'blendScreen',
    category: 'Color',
    signature: "blendScreen(base, blend): Vec3",
    doc: "Screen blend of a hue strip with a moving radial glow.",
    shader: blendScreenExample,
  },
  {
    key: 'blendOverlayChannel',
    category: 'Color',
    signature: "blendOverlayChannel(base, blend): number",
    doc: "Overlay for one channel: base across x, blend across y.",
    shader: blendOverlayChannelExample,
  },
  {
    key: 'blendOverlay',
    category: 'Color',
    signature: "blendOverlay(base, blend): Vec3",
    doc: "Overlay blend of a hue strip with a vertical grey gradient.",
    shader: blendOverlayExample,
  },
  {
    key: 'tonemapACES',
    category: 'Color',
    signature: "tonemapACES(color: Vec3): Vec3",
    doc: "HDR ramp: top clipped raw, bottom ACES filmic.",
    shader: tonemapACESExample,
  },
  {
    key: 'tonemapReinhard',
    category: 'Color',
    signature: "tonemapReinhard(color: Vec3): Vec3",
    doc: "HDR ramp: top clipped raw, bottom Reinhard c/(1+c).",
    shader: tonemapReinhardExample,
  },
  {
    key: 'gammaCorrect',
    category: 'Color',
    signature: "gammaCorrect(color, gamma): Vec3",
    doc: "Linear ramp on top; gamma-2.2 encoded below.",
    shader: gammaCorrectExample,
  },
  {
    key: 'filmGrain',
    category: 'Color',
    signature: "filmGrain(uv: Vec2, time: number): number",
    doc: "Animated grain added to a mid-grey field.",
    shader: filmGrainExample,
  },
  {
    key: 'lambert',
    category: 'Lighting',
    signature: "lambert(normal, lightDir): number",
    doc: "Diffuse term only, light orbiting the sphere.",
    shader: lambertExample,
  },
  {
    key: 'blinnPhongSpec',
    category: 'Lighting',
    signature: "blinnPhongSpec(normal, lightDir, viewDir, shininess): number",
    doc: "Specular highlight only (shininess 32).",
    shader: blinnPhongSpecExample,
  },
  {
    key: 'specGGX',
    category: 'Lighting',
    signature: "specGGX(normal, lightDir, viewDir, roughness): number",
    doc: "GGX microfacet specular only (roughness 0.3).",
    shader: specGGXExample,
  },
  {
    key: 'fresnel',
    category: 'Lighting',
    signature: "fresnel(normal, viewDir, power): number",
    doc: "Rim term only \u2014 bright at grazing angles.",
    shader: fresnelExample,
  },
  {
    key: 'toonShade',
    category: 'Lighting',
    signature: "toonShade(normal, lightDir, bands): number",
    doc: "Cel-banded diffuse with 4 bands.",
    shader: toonShadeExample,
  },
  {
    key: 'hemisphereLight',
    category: 'Lighting',
    signature: "hemisphereLight(normal, skyColor, groundColor): Vec3",
    doc: "Ambient only: blue sky above, warm ground below.",
    shader: hemisphereLightExample,
  },
  {
    key: 'sdCircle',
    category: 'SDF 2D',
    signature: "sdCircle(p: Vec2, radius): number",
    doc: "Distance field of a circle: bands outside (blue) and inside (orange).",
    shader: sdCircleExample,
  },
  {
    key: 'sdBox2',
    category: 'SDF 2D',
    signature: "sdBox2(p: Vec2, halfSize: Vec2): number",
    doc: "Distance field of a box.",
    shader: sdBox2Example,
  },
  {
    key: 'sdRoundedBox2',
    category: 'SDF 2D',
    signature: "sdRoundedBox2(p, halfSize, radius): number",
    doc: "Box with an animated corner radius.",
    shader: sdRoundedBox2Example,
  },
  {
    key: 'sdHexagon',
    category: 'SDF 2D',
    signature: "sdHexagon(p: Vec2, radius): number",
    doc: "Distance field of a regular hexagon.",
    shader: sdHexagonExample,
  },
  {
    key: 'sdSegment2',
    category: 'SDF 2D',
    signature: "sdSegment2(p, a, b): number",
    doc: "Distance to a moving line segment.",
    shader: sdSegment2Example,
  },
  {
    key: 'smoothUnion',
    category: 'SDF 2D',
    signature: "smoothUnion(d1, d2, k): number",
    doc: "Circle and box merging smoothly (k = 0.1).",
    shader: smoothUnionExample,
  },
  {
    key: 'smoothSubtract',
    category: 'SDF 2D',
    signature: "smoothSubtract(d1, d2, k): number",
    doc: "A circle smoothly carved out of a box.",
    shader: smoothSubtractExample,
  },
  {
    key: 'smoothIntersect',
    category: 'SDF 2D',
    signature: "smoothIntersect(d1, d2, k): number",
    doc: "Smooth intersection of a circle and a box.",
    shader: smoothIntersectExample,
  },
  {
    key: 'fillAA',
    category: 'SDF 2D',
    signature: "fillAA(d, softness): number",
    doc: "Antialiased fill of a hexagon distance field.",
    shader: fillAAExample,
  },
  {
    key: 'strokeAA',
    category: 'SDF 2D',
    signature: "strokeAA(d, width, softness): number",
    doc: "Antialiased outline along the zero line of a hexagon.",
    shader: strokeAAExample,
  },
  {
    key: 'sdSphere3',
    category: 'SDF 3D',
    signature: "sdSphere3(p: Vec3, radius): number",
    doc: "Raymarched sphere with a pulsing radius.",
    shader: sdSphere3Example,
  },
  {
    key: 'sdBox3',
    category: 'SDF 3D',
    signature: "sdBox3(p: Vec3, halfSize: Vec3): number",
    doc: "Raymarched rotating box.",
    shader: sdBox3Example,
  },
  {
    key: 'sdTorus3',
    category: 'SDF 3D',
    signature: "sdTorus3(p: Vec3, radii: Vec2): number",
    doc: "Raymarched tumbling torus.",
    shader: sdTorus3Example,
  },
  {
    key: 'sdCapsule3',
    category: 'SDF 3D',
    signature: "sdCapsule3(p, a, b, radius): number",
    doc: "Raymarched capsule with a waving endpoint.",
    shader: sdCapsule3Example,
  },
  {
    key: 'sdOctahedron3',
    category: 'SDF 3D',
    signature: "sdOctahedron3(p: Vec3, size): number",
    doc: "Raymarched rotating octahedron.",
    shader: sdOctahedron3Example,
  },
  {
    key: 'sdPlane3',
    category: 'SDF 3D',
    signature: "sdPlane3(p, normal, height): number",
    doc: "Ground plane with a resting sphere for scale.",
    shader: sdPlane3Example,
  },
];
