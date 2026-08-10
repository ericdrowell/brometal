# Changelog

## Unreleased

## 0.17.1 (2026-08-10)

- No library changes; maintenance release.

## 0.17.0 (2026-08-09)

### Added
- **js13k shaders name themselves.** `export const Cube = shader({...})` emits
  the global `Cube` — the identifier your game writes, with no prefix, no case
  conversion and nothing derived from the file name. A name conjured from a
  filename is one you cannot find by searching for it, and `--js13k` puts it in
  the single scope the whole game shares, so `export default` is now an error
  that says what to write instead. Two shaders exporting the same name is an
  error too: they would collide silently, the second `const` winning while the
  first shader drew with the wrong pipeline. The ordinary build still accepts
  either form.

### Improved
- **`--js13k` writes into `dist/` rather than a `js13k/` folder.** Generated
  output belongs in the build directory, not beside the source it came from.
- **The runtime and the shaders are emitted together.** Both files come from one
  command and both carry the version that wrote them. The descriptors are
  positional arrays that the runtime indexes by number, with no names to check
  against, so a runtime obtained separately could be a version out of step and
  would not complain — it would build a pipeline from the wrong slots and draw
  nothing. Emitting the pair makes that impossible rather than merely unlikely.

## 0.16.0 (2026-08-09)

### Added
- **`--js13k`: a build for 13-kilobyte games.** `brometal prod --js13k` emits
  `js13k/brometal.js` — a WebGPU runtime as plain global functions, no modules or
  classes — plus `js13k/shaders.js` holding each shader as a positional array
  rather than a typed module. Runtime, three shaders and a small game minify
  together to about **3 KB gzipped**, leaving ~10 KB of the budget for the game.
  Covers what a real entry needs: multiple programs, 2D textures from a canvas,
  instancing, alpha blending with depth writes off, depth testing, optional
  back-face culling, a matrix stack and mat4 helpers.
  - Emitted as **source**, not a prebuilt bundle. A js13k entry concatenates
    everything and runs one minifier, so source lets that minifier mangle across
    the boundary — including the API names. A prebuilt bundle cannot be mangled
    jointly and pins them at full length. Comments are free for the same reason.
  - The compiler is untouched: `--js13k` swaps only the serializer and the
    runtime, so shaders are still written in the same typed DSL.
  - Uniform offsets ship as a comment rather than data, so they cost nothing at
    runtime and are still there when you fill the block by hand.
- **A js13k starter** at `templates/js13k`: a spinning textured cube that builds
  to a **2,989-byte zip**, leaving **10,323 bytes** of the budget. Everything is
  inlined into a single `dist/index.html`, so it opens straight from disk —
  `file://` is a secure context, so WebGPU works without a server. `npm run build` compiles the
  shaders, concatenates runtime + shaders + game, minifies the whole program in
  one pass, zips it, and **fails if the archive goes over 13,312 bytes** —
  printing what is left when it passes.
  - `npm run test:template` builds it against the local package and is part of
    the release chain, so a broken starter cannot ship. It depends on the js13k
    runtime, the serializer and the shader DSL at once, which makes it the piece
    most likely to rot unnoticed.

### Improved
- **One core runtime, shared by both builds.** The js13k runtime was a parallel
  hand-written implementation with no connection to `src/runtime` — every WebGPU
  fix had to be made twice, and the three bugs it shipped with (buffer padding,
  usage bits, `float32x1`) were all in code the regular runtime already had
  right. It is now `src/tiny`, written as a typed module, compiled by `tsc`, and
  consumed two ways: `--js13k` strips the module syntax to emit globals, and
  `full` imports it.
  - The facts both must agree on — buffer usage bits, vertex formats, the 4-byte
    write alignment, the `vs_main`/`fs_main` entry points — live in a **stateless**
    `src/tiny/gpu.ts`. Statelessness is the point: when they sat beside the
    core's device variables, importing them pulled the whole module in, because
    mutable module bindings defeat tree-shaking. Split out, sharing them costs
    the regular runtime nothing (measured 19 bytes *smaller* gzipped than
    inlining them).
  - `full` keeps its own program and draw path. Its uniform ring, pipeline cache
    per pass shape, MSAA and render targets are what make it the larger build;
    pushing them into the core would defeat the 13 kB budget, and making the core
    serve them would defeat both.
- **Breaking: unknown CLI flags are now rejected.** They were collected and
  ignored, so a misspelled or unsupported flag ran an ordinary build and exited
  0 — which is how `--js13k` against a release predating it quietly emitted
  `.gen.ts` files and failed several steps later, pointing at the wrong thing.
  The CLI now names the flag, prints help and exits 1. If a script passes a stray
  flag that previously appeared to work, it will now fail; remove the flag.

## 0.15.0 (2026-08-02)

### Added
- **Typed, catchable errors.** `BroMetalError` carries a `code` an application
  can branch on: `webgpu-unavailable`, `gpu-adapter-unavailable`,
  `gpu-device-unavailable`, `canvas-context-unavailable`, `gpu-device-lost`,
  `gpu-error`. The distinction matters — a browser without WebGPU and a machine
  whose adapter request was refused look identical on a canvas but need different
  advice. `isBroMetalError` narrows an unknown caught value.
- **`errorTitle(code)`** renders a code as the sentence a person should read:
  `gpu-adapter-unavailable` becomes "GPU adapter unavailable". Each code names
  the exact thing that could not be obtained, walking down the acquisition chain
  — API, adapter, device, canvas context — and the label is derived from the code
  rather than looked up beside it, so the two cannot drift apart.
- **`createRenderer(canvas, { onError })`.** Called when the GPU fails *after*
  the renderer exists. Creation failures reject the promise and are caught
  normally; these cannot be, because they happen frames later with no call of
  yours on the stack. Wired to `device.lost` and the device's `uncapturederror`
  event, neither of which was previously observed at all — so a lost device or a
  pipeline that failed validation simply stopped drawing, with no exception
  anywhere and nothing in the console. With no handler the runtime warns once and
  then stays quiet, since a bad pipeline re-raises every frame.
- **`gpu-adapter-unavailable` is now its own failure.** WebGPU present but no adapter
  granted is common — virtual machines, remote desktop, blocklisted drivers,
  hardware acceleration switched off — and it previously threw a message that
  told the user nothing actionable.

### Improved
- **The library still renders nothing on failure.** No message is drawn into the
  canvas and no DOM is touched; where and how to show a failure belongs to the
  application, in its own design language. What the runtime owes it is a failure
  that is catchable, distinguishable, and never silent.
- **`npm run test:gpu` runs Chrome and WebKit.** Chrome covers the real WebGPU
  path; Playwright's WebKit exposes no `navigator.gpu`, which makes it an exact
  stand-in for a Safari without WebGPU and lets the rejection, its code, and the
  canvas being left untouched all be asserted on a real browser. WebKit needs a
  one-time `npx playwright-core install webkit`. This does not cover Safari's
  stricter WGSL validation — Playwright cannot drive real Safari, and its WebKit
  build has no WebGPU — so that remains a manual check.

## 0.14.0 (2026-08-02)

### Added
- **`createRenderer` throws where WebGPU is missing.** It names the requirement
  and the browsers that meet it, rather than returning a renderer that cannot
  draw. Chrome and Edge 113+, Firefox 141+, Safari 26+.
- **Render-target coverage in `npm run test:gpu`.** Two new fixtures write a
  known uv into a target and sample it back on real hardware, checking both that
  the contents survive the round trip and that the rows come back in the
  documented order. This path had no automated coverage at all once the WebGL2
  unit tests went; a mirrored target still draws something plausible.

### Improved
- **Breaking: WebGPU only.** The compiler emits WGSL and nothing else, and the
  WebGL2 runtime is gone. Supporting both meant every feature had to be
  expressible in the older API, and the features worth building on — compute
  shaders, storage buffers — have no WebGL2 equivalent. A typical app now bundles
  to ~19 KB minified / 7 KB gzipped, down from ~23 KB / 8.5 KB. What went, and
  what to do instead:
  - `RendererOptions.backend` and `Renderer.gl` are removed, and
    `RendererBackend` is `'webgpu'` alone. Drop the option; there is nothing to
    select between.
  - Compiled modules carry `wgslSrc`; `vertexSrc`, `fragmentSrc` and
    `webgpuOnly` are gone, as are the `targets` and `precision` compile options
    and the `--targets` / `--precision` CLI flags. Recompile with
    `npx brometal dev --once` — the runtime says so plainly if it meets a module
    built by an older compiler.
- **Breaking: reserved-word checking follows WGSL.** The compiler previously
  guarded against GLSL ES 3.00's reserved list, which no longer describes what
  will fail. It now rejects WGSL's keywords, predeclared types and
  reserved-for-future words — including ordinary-looking names like `type`,
  `set`, `from`, `match`, `target` and `filter` — and identifiers starting with
  `__`. Names GLSL reserved but WGSL does not, such as `sample` and `output`,
  are usable again.
- **Uniform length checking lives in one place.** Moved into
  `checkUniformValue`, so the size the compiler recorded is enforced once. A
  short write does not fail on its own; it shifts every uniform packed after it,
  and the wrong value surfaces somewhere unrelated.

## 0.13.0 (2026-08-01)

### Added
- **Examples ship in the npm package.** Every example from the website is copied
  into `examples/` at publish time — `shaders/` holds the `*.shader.ts` sources,
  `demos/` the runtime code that drives them. Intended as reference material for
  people and for AI coding agents, which otherwise write GLSL-shaped code that
  does not compile. The website's `@/` path aliases are rewritten so the copies
  read as if written against the published package.
- **A compute stage (WebGPU only).** `shader({ compute(uniforms, id) { ... } })`,
  with an optional `workgroupSize` (default `[64, 1, 1]`). `id` is the global
  invocation id as floats. Compute returns nothing and communicates through
  `storageWrite(buffer, index, value)`; buffers a compute stage writes are
  emitted as `var<storage, read_write>` and the rest stay `read`. A shader may be
  compute-only — `attributes`, `vertex` and `fragment` are no longer required
  when a `compute` stage is present. Run one with `program.dispatch(x, y, z)`,
  where the counts are workgroups rather than threads; it opens its own encoder,
  so it works inside or outside `renderer.loop()`.
- **Storage buffers (WebGPU only).** Declare by element type — `storage: { wave:
  'vec2' }` is an `array<vec2<f32>>` — and read with `storageRead(buffer, index)`
  or measure with `storageLength(buffer)`. Access is a function rather than
  `buffer[i]` because the DSL has no indexing; routing it through a call keeps
  storage inside the machinery `texture()` already uses. Bind with
  `createStorageBuffer(renderer, data)`.
- **WebGPU-only shaders degrade gracefully.** A shader using a feature WebGL2
  cannot express no longer fails the whole compile: the GLSL target is dropped,
  `webgpuOnly` is set on the compiled module, and a warning explains why. WebGL2
  is GLSL ES 3.00 and SSBOs arrived in 3.10, so there is nothing to emit.
- **`sampler3D` and `createTexture3D`.** Volume textures, for fields that vary
  through space rather than across a surface — cloud density, precomputed
  scattering, flow volumes. `texture()` now accepts either a `sampler2D` with a
  `vec2` or a `sampler3D` with a `vec3`, including through helper parameters.
  Wraps on all three axes, and WebGPU declares the matching `3d` view dimension.
- `createProgram(renderer, shader, { blend })` — `'alpha'` and `'additive'`
  blend modes on both backends; blended programs depth-test but don't
  depth-write.
- `mat4.lookAt(eye, target, up?)` and `camera.lookAt(x, y, z)`.
- **Shadow mapping support.** `createRenderTarget` takes `{ depth: true }` to
  attach a depth buffer, so an off-screen pass is depth-tested like the screen
  — a shadow map has to record the nearest surface to the light, and without
  the test that is whichever triangle was drawn last. `renderer.drawTo` takes
  `{ clear }` for what the target starts as, which matters wherever zero is a
  meaningful value rather than an empty one: a distance map cleared to black
  claims an occluder at the light in every texel the geometry missed.
- **Shadows are first-class.** `shadowDepth(worldPos, lightPos, range)` writes
  the map; `shadowFactor(map, lightViewProj, worldPos, normal, lightPos, range,
  texel, softness, bias)` reads it back with 3x3 PCF and slope-scaled bias.
  Between them they own the two mistakes that broke shadows twice while this was
  written by hand — both of which fail *silently* and look like lighting bugs
  rather than coordinate ones:

  - the per-backend uv, which a hand-rolled `clip.xy / clip.w * 0.5 + 0.5` gets
    vertically mirrored on one of the two backends;
  - the bias units, which are world-space — subtracting the bias after dividing
    by `range` scales it by `range`, wide enough to erase every contact shadow
    while leaving long ones intact.

  `shadowFactor` calls `shadowDepth` rather than repeating the formula, so the
  value written into the map and the value compared against it cannot drift.
- **Helper functions can take a `Sampler2D` parameter.** Needed for the above:
  GLSL takes a sampler parameter directly, while WGSL keeps the texture and its
  sampler as separate objects, so the emitter expands one DSL parameter into two
  WGSL ones and expands the argument to match at every call site. Note that a
  texture sampled inside a helper uses `textureSampleLevel`, which is exempt
  from WGSL's uniform-control-flow rule but always reads LOD 0.
- **`AGENTS.md` ships in the package**, alongside a repo-root one for
  contributors. It documents the DSL rules and, more usefully, the failures that
  produce a black screen with an empty console. A test asserts every exported
  shader function appears in it, so the list cannot rot.
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

### Improved
- **`npm run test:gpu` — GPU integration tests.** Compiles fixture shaders,
  bundles a browser entry, serves it, and drives the system Chrome to assert on
  pixels the GPU actually produced. The vitest suite verifies the compiler emits
  correct shader text and cannot see anything downstream of that: four bugs
  shipped past it while the compute stage was written, one of which raised no
  error at all. Uses `playwright-core` against the installed Chrome, so no
  browser is downloaded, and stays out of `npm test` because it needs a GPU.
- **Releases stamp the changelog and sync the package.** `npm run release`
  promotes `## Unreleased` to a dated version heading, regenerates the examples
  and changelog copies inside the package, and stages both into the release
  commit. Entries stay hand-written during development; only the version number
  and date are added at release, because the version is not known before then.
- **`CLAUDE.md` ships in the package.** An AI coding agent working in a consumer's
  repo now finds a BroMetal orientation without being told to look for one: that
  shaders are typed TypeScript rather than GLSL strings, that `.shader.ts` must be
  compiled before it does anything, and the failures that are silent — reserved
  words, `texture()` in conditional control flow, render-target row order.
- **README leads with getting started.** Install was at line 46, behind branding,
  a pipeline diagram and a backend deep-dive; it is now first, as three numbered
  steps with the compile step called out as mandatory. Comparison with three.js
  and the backend detail moved below it.
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
- **GLSL: sampler precision is declared, in both stages.** GLSL ES 3.00 defaults
  `sampler2D` to `lowp` unless told otherwise. The emitter previously declared
  `float` precision in the fragment stage only, and never declared samplers at
  all, so every WebGL2 texture read came back quantised — invisible for a colour
  texture, destructive for a texture used as data. Both stages now emit
  `precision <p> float/int`, plus `sampler2D` when the stage actually samples.
- **GLSL: vertex-stage sampling names an explicit LOD.** `texture()` derives its
  mip level from screen-space derivatives, which do not exist in a vertex
  shader; the level is undefined there and drivers may return nothing, which
  shows up as a GPU-displaced mesh that silently never moves. Vertex-stage
  `texture()` now emits `textureLod(..., 0.0)`. Helpers are emitted per stage, so
  the same helper keeps mipmapped sampling in the fragment shader.
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

## 0.12.3 (2026-07-26)
- No library changes; README and site metadata only.

## 0.12.2 (2026-07-26)
- No library changes; site only.

## 0.12.1 (2026-07-26)
- No library changes; README and site metadata only.

## 0.12.0 (2026-07-26)
### Added
- **`createRenderTarget(renderer, { width, height })` and `renderer.drawTo(target, fn)`**
  — an off-screen RGBA16F surface a program draws into and any shader can
  sample. This is what gives the GPU memory between frames: a pass writes state
  into a target and the next frame reads it, with nothing round-tripping through
  the CPU. Both backends; targets sample unfiltered, since they hold numbers
  rather than pictures, and are depth-less unless asked (see shadow mapping
  below).
- **`targetUv(clipPosition)`** — the uv a clip-space position lands on in a
  render target. WebGL2 and WebGPU disagree about which row NDC +y refers to,
  so `clip.xy / clip.w * 0.5 + 0.5` is correct on one backend and vertically
  mirrored on the other; this compiles to the right form for each. Reach for it
  even when targeting one backend, because a mirrored lookup still produces a
  shadow — just attached to the wrong side of the object.
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

## 0.11.1 (2026-07-25)
- No library changes; documentation only.

## 0.11.0 (2026-07-25)
### Improved
- **CSS sizes the canvas; BroMetal owns the drawing buffer.** The
  `width`/`height` attributes are no longer read at all — size the canvas with a
  stylesheet (flex and grid included) and the runtime tracks it at the device
  pixel ratio. See "Sizing the canvas" in the README.

### Fixed
- **A canvas with no CSS size no longer collapses or runs away** (both
  backends). Matching the drawing buffer to `clientWidth` fed output back into
  input, because without a CSS size the layout box takes its size *from* the
  drawing buffer: one zero read latched the buffer to 1x1 forever, and on a
  HiDPI screen it instead doubled every pass (800 → 1600 → 3200 …). The runtime
  now probes each canvas once to establish which way the dependency runs; a
  canvas with no CSS size is left exactly as authored and warns once naming the
  fix. Reported and first diagnosed by @shadowcodex (#1).

## 0.10.1 (2026-07-23)
- No library changes; packaging and site assets only.

## 0.10.0 (2026-07-23)
### Fixed
- **WGSL: `mod(a, b)` with compound operands now computes correctly.** The
  floor-based polyfill interpolated operands without parentheses, so
  `mod(x + y, w)` emitted `floor(x + y / w)` — wrong values on the WebGPU
  backend only (GLSL uses native `mod`).

## 0.9.0 (2026-07-23)
### Added
- **GLB model loading.** `loadGlb(url)` and `parseGlb(buffer)`, returning `Model`
  / `ModelMesh` / `ModelImage` — positions, normals, uvs, indices and embedded
  textures, ready to hand to a program's attributes.
- **`gerstnerWave`, `gfbm2` and `rotate3`** in `brometal/shader-functions`.

## 0.8.0 (2026-07-23)
### Added
- **Blend modes.** `createProgram(renderer, shader, { blend: 'alpha' })` for
  classic transparency or `'additive'` for light accumulation — glows and
  particles. Blended programs test depth but do not write it. `BlendMode` and
  `ProgramOptions` are exported.
- **`camera.lookAt(x, y, z)`** and **`mat4.lookAt`**.

## 0.7.0 (2026-07-23)
- `brometal/shader-functions` — the typed GPU function library (**renamed**
  from `brometal/shaders`, which now holds prebuilt shaders).
- `brometal/shaders` — 30 complete prebuilt shaders, compiled at package
  build time.
- Shader function library grown to 63 functions (gradient/3D noise, domain
  warp, Worley edges, curl, blend modes, GGX, toon, more SDFs and easings).
- Website: per-function reference page, 30-effect library page, font-based
  logo, new tagline.

## 0.6.0 (2026-07-23)
- Cross-module shader imports: `import { fbm2 } from 'brometal/shaders'`.
- Initial shader function library (31 functions) and website showcase.
- WGSL emitter fix: vector `clamp` with scalar bounds now splats bounds.

## 0.5.0 (2026-07-22)
- **WebGPU backend**: every shader compiles to WGSL alongside GLSL;
  `createRenderer` became **async** with `backend: 'auto' | 'webgl2' |
  'webgpu'` and automatic fallback. **Breaking**: `createProgram`,
  `createTexture`, and `loadTexture` now take the renderer instead of a GL
  context.
- CLI `--targets=webgl2,webgpu` flag.
- DSL: helper functions, `let`, compound assignment, `for` loops, 12 new
  intrinsics. Custom Shader example.
- Backend badge on example pages.

## 0.4.0 (2026-07-22)
- Geometry library: cube, sphere, plane, cylinder, cone, torus, torus knot,
  circle, ring.
- Examples restructured into the website package (Next.js), deployed on
  Vercel; dev builds use the workspace package, prod builds the published one.

## 0.3.0 (2026-07-21)
- Textures (`sampler2D`, `texture()` intrinsic, compile-time texture units),
  Blinn-Phong lighting example, `createCamera`.
- Precompiled wiring: attribute locations, buffer layouts, and uniform
  routines baked into generated modules; compile-time diagnostics for unused
  interface members; `--precision` flag; renderer perf options (culling,
  high-performance GPU, allocation-free mat4).

## 0.2.1 (2026-07-21)
- No library changes; documentation only.

## 0.2.0 (2026-07-21)
- Instancing (`instanceAttributes`, automatic instanced draws).
- 125,000-cube demo.

## 0.1.0 (2026-07-21)
- Initial release: TypeScript-to-GLSL compiler (`npx brometal dev|prod`),
  WebGL2 runtime, typed end-to-end shader interfaces, mat4 math.
