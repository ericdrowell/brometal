# Changelog

BroMetal is pre-1.0: minor versions may include breaking changes, and every
breaking change is listed here. The DSL surface (`shader()`, the interface
records, `brometal/shader-functions`) is considered stable-by-intent; runtime
APIs may still shift until 1.0.

## Unreleased

### Added
- `createProgram(renderer, shader, { blend })` — `'alpha'` and `'additive'`
  blend modes on both backends; blended programs depth-test but don't
  depth-write.
- `mat4.lookAt(eye, target, up?)` and `camera.lookAt(x, y, z)`.
- Game experience example: Starfighter.
- Concept examples: Blend (mode comparison), Terrain (noise-displaced
  vertices), Ripples (eased elastic rings), and Ocean (Gerstner waves with
  fresnel and specular glint).

### Fixed
- **WebGPU: multiple draws per frame from one program now keep their own
  uniform values** (per-draw uniform slots bound via dynamic offsets).
  Previously every draw in a frame saw the last-written uniforms.

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
