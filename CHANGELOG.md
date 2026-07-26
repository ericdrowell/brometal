# Changelog

BroMetal is pre-1.0: minor versions may include breaking changes, and every
breaking change is listed here. The DSL surface (`shader()`, the interface
records, `brometal/shader-functions`) is considered stable-by-intent; runtime
APIs may still shift until 1.0.

## Unreleased

### Changed
- **CSS sizes the canvas; BroMetal owns the drawing buffer.** The
  `width`/`height` attributes are no longer read at all — size the canvas with a
  stylesheet (flex and grid included) and the runtime tracks it at the device
  pixel ratio. See "Sizing the canvas" in the README.

### Added
- `createProgram(renderer, shader, { blend })` — `'alpha'` and `'additive'`
  blend modes on both backends; blended programs depth-test but don't
  depth-write.
- `mat4.lookAt(eye, target, up?)` and `camera.lookAt(x, y, z)`.
- `loadTexture`/`createTexture` accept `{ anisotropy }` (1–16, clamped to what
  the GPU reports). Ground and walls seen at a grazing angle are what it fixes:
  trilinear has to pick one mip for a footprint that is many texels long and
  one wide, so the surface is over-blurred across and aliased along at once.
- Game experience examples: Star Bro — fly the Spitfire glb through an
  instanced asteroid field; Brocraft — a block world whose terrain, materials
  and culling are all derived in the vertex shader from a grid of instance
  offsets.
- Concept examples: Blend (mode comparison), Terrain (noise-displaced
  vertices), Ripples (eased elastic rings), and Ocean (Gerstner waves with
  fresnel and specular glint).
- Three new shader functions: `gfbm2` (fbm over gradient noise), `rotate3`
  (axis-angle rotation), and `gerstnerWave` (ocean wave displacement).
- WebGPU backend now renders with 4x MSAA (matching the WebGL2 backend's
  antialiasing); disable with `createRenderer(canvas, { antialias: false })`.
- `parseGlb(bytes)` / `loadGlb(url)` — a minimal glTF-Binary model loader
  returning attribute-ready typed arrays and embedded images; Model example
  (Quaternius Spitfire, CC0) added to the Basics section.

### Fixed
- **A canvas with no CSS size no longer collapses or runs away** (both
  backends). Matching the drawing buffer to `clientWidth` fed output back into
  input, because without a CSS size the layout box takes its size *from* the
  drawing buffer: one zero read latched the buffer to 1x1 forever, and on a
  HiDPI screen it instead doubled every pass (800 → 1600 → 3200 …). The runtime
  now probes each canvas once to establish which way the dependency runs; a
  canvas with no CSS size is left exactly as authored and warns once naming the
  fix. Reported and first diagnosed by @shadowcodex (#1).
- **WebGPU: multiple draws per frame from one program now keep their own
  uniform values** (per-draw uniform slots bound via dynamic offsets).
  Previously every draw in a frame saw the last-written uniforms.
- **WebGPU: textures get a mip chain.** `filter: 'smooth'` documented trilinear
  filtering, but WebGPU has no `generateMipmap` and the runtime never built one —
  every minified texture sampled level 0 and shimmered. The runtime now renders
  the chain itself and samples it with `mipmapFilter: 'linear'`.
- **WebGL2: the depth buffer is cleared again after a blended draw.** Blended
  programs turn depth writes off, and `glClear` honours the depth write mask —
  so the next frame's `DEPTH_BUFFER_BIT` clear was silently a no-op and every
  frame after the first depth-tested against stale values. Static scenes
  vanished entirely; moving ones flickered.
- **WGSL: `mod(a, b)` with compound operands now computes correctly.** The
  floor-based polyfill interpolated operands without parentheses, so
  `mod(x + y, w)` emitted `floor(x + y / w)` — wrong values on the WebGPU
  backend only (GLSL uses native `mod`).

## 0.7.0 — 2026-07-23

- `brometal/shader-functions` — the typed GPU function library (**renamed**
  from `brometal/shaders`, which now holds prebuilt shaders).
- `brometal/shaders` — 30 complete prebuilt shaders, compiled at package
  build time.
- Shader function library grown to 63 functions (gradient/3D noise, domain
  warp, Worley edges, curl, blend modes, GGX, toon, more SDFs and easings).
- Website: per-function reference page, 30-effect library page, font-based
  logo, new tagline.

## 0.6.0 — 2026-07-23

- Cross-module shader imports: `import { fbm2 } from 'brometal/shaders'`.
- Initial shader function library (31 functions) and website showcase.
- WGSL emitter fix: vector `clamp` with scalar bounds now splats bounds.

## 0.5.0 — 2026-07-22

- **WebGPU backend**: every shader compiles to WGSL alongside GLSL;
  `createRenderer` became **async** with `backend: 'auto' | 'webgl2' |
  'webgpu'` and automatic fallback. **Breaking**: `createProgram`,
  `createTexture`, and `loadTexture` now take the renderer instead of a GL
  context.
- CLI `--targets=webgl2,webgpu` flag.
- DSL: helper functions, `let`, compound assignment, `for` loops, 12 new
  intrinsics. Custom Shader example.
- Backend badge on example pages.

## 0.4.0 — 2026-07-22

- Geometry library: cube, sphere, plane, cylinder, cone, torus, torus knot,
  circle, ring.
- Examples restructured into the website package (Next.js), deployed on
  Vercel; dev builds use the workspace package, prod builds the published one.

## 0.3.0 — 2026-07-21

- Textures (`sampler2D`, `texture()` intrinsic, compile-time texture units),
  Blinn-Phong lighting example, `createCamera`.
- Precompiled wiring: attribute locations, buffer layouts, and uniform
  routines baked into generated modules; compile-time diagnostics for unused
  interface members; `--precision` flag; renderer perf options (culling,
  high-performance GPU, allocation-free mat4).

## 0.2.0 — 2026-07-21

- Instancing (`instanceAttributes`, automatic instanced draws).
- 125,000-cube demo.

## 0.1.0 — 2026-07-21

- Initial release: TypeScript-to-GLSL compiler (`npx brometal dev|prod`),
  WebGL2 runtime, typed end-to-end shader interfaces, mat4 math.
