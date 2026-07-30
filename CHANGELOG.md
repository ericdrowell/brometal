# Changelog

BroMetal is pre-1.0: minor versions may include breaking changes, and every
breaking change is listed here. The DSL surface (`shader()`, the interface
records, `brometal/shader-functions`) is considered stable-by-intent; runtime
APIs may still shift until 1.0.

## Unreleased

### Changed
- **WebGL2 alpha blending now matches WebGPU's destination alpha.** `blend:
  'alpha'` applied `SRC_ALPHA` to the alpha channel too, writing `aSrc²` where
  the WebGPU backend wrote `aSrc`. Invisible on an opaque canvas; visible
  wherever that alpha is read back — a composited canvas, or a blended pass into
  a render target that is later sampled. Now uses `blendFuncSeparate`.
- **CSS sizes the canvas; BroMetal owns the drawing buffer.** The
  `width`/`height` attributes are no longer read at all — size the canvas with a
  stylesheet (flex and grid included) and the runtime tracks it at the device
  pixel ratio. See "Sizing the canvas" in the README.
- **Breaking: `applyFriction` takes a normal impulse.**
  `applyFriction(vel, normal, normalImpulse, friction)` — pass the length of the
  velocity change `bounceVelocity` just produced. The old three-argument form
  damped the entire tangential plane at every contact, which is not friction:
  for a vertical surface that plane contains the *downward* axis, so anything
  brushing a wall had its fall damped every substep and hung there. Friction is
  now bounded by the normal force, as Coulomb friction is, so a body pressed
  onto the floor by gravity still grips while one merely touching a wall slides
  past it freely.

### Fixed
- **WebGPU: several uploads to one program per frame no longer alias.** A frame
  is one command encoder submitted once at the end, and `queue.writeBuffer` is
  ordered against that submit rather than against the draws inside it — so two
  draws that each uploaded their own instance data both saw whichever batch was
  written *last*. Attribute uploads now append at a fresh offset when they
  repeat within a frame, and each draw binds its vertex buffers at the offset its
  own data went to. This is the same mechanism the uniform ring already used for
  the same reason. Uploading once per frame, which is what every existing
  example does, is unaffected.
- **WebGPU: a buffer that outgrows its allocation mid-frame is no longer
  destroyed while still referenced.** Draws already recorded into the open pass
  point at the old buffer, so destroying it failed the entire submit — taking
  every draw in the frame down, not just the one that grew. Replaced buffers are
  now released at the next frame boundary.

### Added
- **`discard()` in the shader DSL** — fragment-stage only, usable inside an
  `if`, compiled to `discard` in both GLSL and WGSL. This is what makes cut-out
  sprites work: discard the sub-threshold alpha and every surviving fragment is
  opaque, so the program can write depth and the GPU orders the sprites instead
  of the CPU sorting them back-to-front every frame. Rejected in `vertex()`, in
  helpers (which `vertex()` can call), as a value, and with arguments.
- **`program.draw({ instanceCount })`** — draw part of what was uploaded, so one
  over-allocated buffer can back a pool that grows and shrinks without
  reallocating. A count larger than what was uploaded is clamped, with one warning
  per message; a zero count skips the draw. It is not an exception, because
  `draw()` runs inside the frame callback and both loops re-arm
  `requestAnimationFrame` only after that callback returns.
- **`mat4.orthographic(left, right, bottom, top, near, far, out?)`** — the 2D
  projection. Same GL clip conventions as `mat4.perspective`, so one matrix
  drives both backends.
- **Full swizzle types.** `Vec2`/`Vec3`/`Vec4` now type every swizzle the
  compiler already accepted. `v4.zw` compiled to correct GLSL but failed
  typecheck with TS2339 — exactly the spelling an atlas-rect shader wants.
- `createProgram(renderer, shader, { blend })` — `'alpha'` and `'additive'`
  blend modes on both backends; blended programs depth-test but don't
  depth-write. A cut-out program that returns alpha 1 is opaque, so `blend: 'none'`
  already writes depth — no option needed.
- `mat4.lookAt(eye, target, up?)` and `camera.lookAt(x, y, z)`.
- **`createRenderTarget(renderer, { width, height })` and `renderer.drawTo(target, fn)`**
  — an off-screen RGBA16F surface a program draws into and any shader can
  sample. This is what gives the GPU memory between frames: a pass writes state
  into a target and the next frame reads it, with nothing round-tripping through
  the CPU. Both backends; targets sample unfiltered, since they hold numbers
  rather than pictures, and are depth-less unless asked (see shadow mapping
  below).
- **Physics functions in `brometal/shader-functions`** — `integrateVelocity`,
  `integratePosition`, `verletStep`, `applyDrag`, `bounceVelocity`,
  `applyFriction`, `restingDamp`, `boxContactNormal`, `clampInsideBox`,
  `spherePenetration`, `separateSpheres`, `collisionImpulse`. Pure functions in
  the same tree-shaken library as the noise and lighting sets.
  `boxContactNormal` takes a contact `tolerance`: a resting sphere is clamped to
  exactly the wall, and storing that position can leave it a hair inside, so an
  exact test reports no contact and the sphere is never damped — it looks still
  while gravity winds its velocity up without limit.

  The Ball Physics example resolves contacts by *prevention* rather than
  correction: each ball asks every neighbour how far along its step it may
  travel before touching, and takes the smallest answer, so it never enters one.
  A pile that is allowed to interpenetrate has to unwind that penetration
  afterwards, which reads as the whole heap slowly inflating for seconds after
  it looks settled. Worth copying if you build something similar.
- **Shadow mapping support.** `createRenderTarget` takes `{ depth: true }` to
  attach a depth buffer, so an off-screen pass is depth-tested like the screen
  — a shadow map has to record the nearest surface to the light, and without
  the test that is whichever triangle was drawn last. `renderer.drawTo` takes
  `{ clear }` for what the target starts as, which matters wherever zero is a
  meaningful value rather than an empty one: a distance map cleared to black
  claims an occluder at the light in every texel the geometry missed.
- **`targetUv(clipPosition)`** — the uv a clip-space position lands on in a
  render target. WebGL2 and WebGPU disagree about which row NDC +y refers to,
  so `clip.xy / clip.w * 0.5 + 0.5` is correct on one backend and vertically
  mirrored on the other; this compiles to the right form for each. Reach for it
  even when targeting one backend, because a mirrored lookup still produces a
  shadow — just attached to the wrong side of the object.
- `loadTexture`/`createTexture` accept `{ anisotropy }` (1–16, clamped to what
  the GPU reports). Ground and walls seen at a grazing angle are what it fixes:
  trilinear has to pick one mip for a footprint that is many texels long and
  one wide, so the surface is over-blurred across and aliased along at once.
- Every example page shows a frame-time readout — fps and ms, sampled twice a
  second rather than per frame, since a `setState` on every frame costs more
  than the frame it is measuring.
- Shadow example — shadow mapping in two passes, with light height, PCF
  softness and map resolution (256–2048) as live controls and the map itself
  drawn as an inset.
- Ball Physics: the glass reflects the scene. A half-resolution copy of the
  scene is rendered with camera distance in the alpha channel, and the glass
  marches its reflected ray against it — so a pane shows the actual pile rather
  than a procedural sky. A synthetic studio (gradient, horizon band, two
  softbox lobes) remains as the fallback where the ray leaves the screen, since
  screen-space reflection can only return what the camera already drew.

  Two details are what make the reflection hold together, and both were bugs
  first. A hit has to be a *crossing* — in front of the recorded surface on one
  step and behind it on the next — because merely being behind something lets
  the ray attach to whatever happens to be in the way, which repeats one ball
  six or seven times across a pane. And the march steps evenly in *screen*
  space, not world space: a fixed world step covers a wildly varying number of
  pixels depending on the angle, so neighbouring fragments latch at different
  steps and the reflection tears into bars.

  Intersecting the reflected ray against every ball analytically was tried and
  is exact — no smearing, no repeats, and it sees balls that are off-screen —
  but measured 0.3 ms per ball at a 3944x2424 drawing buffer (53 ms/frame for
  160 balls, 104 ms for 320). The tank is drawn double-sided and the loop
  cannot be skipped for panes that barely reflect, because sampling a texture
  from inside an `if` breaks WGSL's uniform control flow requirement. Marching
  is O(step count) rather than O(ball count) and comes in at 11.5 ms.
- Ball Physics casts shadows. The shadow pass reads ball centres out of the
  same state target the render pass does, so a heap shadows itself and drops
  contact shadows on the tank floor with no position ever returning to the CPU
  — the whole simulation still uploads one float per ball per frame.
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
- **Bodies no longer stick to vertical surfaces.** See the `applyFriction`
  change above. Measured on the Ball Physics example: shaking the tank left one
  ball permanently pinned to a pane, still there 700 frames later; with friction
  bounded by the normal impulse, none remain from the moment the throw lands.
- **Shadow bias is a world-space distance.** It was subtracted from a distance
  already divided by the light's range, which multiplied it by that range — 0.03
  read as 0.6 world units, wide enough to erase every contact shadow while
  leaving long ones intact. Objects resting on a surface cast no shadow at all
  and self-shadowing vanished.
- **GLSL/WGSL reserved words are rejected at build time.** The identifier check
  covered keywords but not GLSL ES 3.00's reserved-for-future-use list, so names
  like `patch`, `half`, `filter`, `sample` and `output` compiled cleanly and then
  failed in the driver — a black screen with nothing in the console. WGSL-only
  keywords (`fn`, `array`, `ptr`, `f32`, …) are covered too, since every shader
  is emitted to both languages.
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
