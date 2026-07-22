# BroMetal

Write TypeScript.  Lift Shaders.  Skip leg day.

BroMetal is LLVM-inspired compiler infrastructure for GPU programming that transforms TypeScript into highly optimized GPU shaders. Today it compiles a typed TypeScript DSL to WebGL2 GLSL (ES 3.00) and ships the WebGL runtime to go with it — buffers, uniforms, program linking, and the render loop are all handled for you.

```mermaid
flowchart TD
    TS[TypeScript] --> Parser
    Parser --> TC[Type Checker]
    TC --> SA[GPU Semantic Analysis]
    SA --> IR[GPU IR]
    IR --> OPT[Optimization Passes]
    OPT --> GLSL --> WebGL
    OPT -.-> WGSL -.-> WebGPU
    OPT -.-> HLSL -.-> DirectX
    OPT -.-> MSL -.-> Metal
```

Solid lines are implemented; dotted backends are the roadmap.

## Quick start

Write a shader as plain TypeScript in a `*.shader.ts` file:

```ts
// src/shaders/cube.shader.ts
import { shader, vec4 } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aColor: 'vec3' },
  uniforms: { uMvp: 'mat4' },
  varyings: { vColor: 'vec3' },

  vertex({ aPosition, aColor }, { uMvp }, v) {
    v.vColor = aColor;
    return uMvp.mul(vec4(aPosition, 1));
  },

  fragment(_uniforms, { vColor }) {
    return vec4(vColor, 1);
  },
});
```

Compile it:

```bash
npx brometal dev    # compile all *.shader.ts and watch for changes
npx brometal prod   # one-shot optimized build (constant folding + minified GLSL)
```

Each `name.shader.ts` compiles to a sibling `name.shader.gen.ts` — a dependency-free module containing the GLSL plus typed interface metadata. Your app imports the generated module and never bundles the compiler:

```ts
import { createRenderer, createProgram, mat4 } from 'brometal';
import cubeShader from './shaders/cube.shader.gen';

const renderer = createRenderer(canvas);
const program = createProgram(renderer.gl, cubeShader);

program.attributes.aPosition.set(positions);   // Float32Array
program.attributes.aColor.set(colors);
program.setIndices(indices);

renderer.loop((t) => {
  program.uniforms.uMvp.set(mat4.multiply(projection, mat4.multiply(view, mat4.rotationY(t))));
  program.draw();
});
```

Everything is typed end-to-end: the attribute/uniform records in `shader()` drive the GLSL declarations, the generated metadata, and the `program.attributes.*` / `program.uniforms.*` accessors — a typo'd uniform name is a compile error in your app, and the compiler enforces the varyings contract (vertex must write every varying) with `file:line:col` diagnostics.

## Camera

`createCamera` gives you a positionable, rotatable camera that compiles down to a single `mat4` uniform:

```ts
const camera = createCamera({ position: [0, 0, 6] });
camera.setPosition(x, y, z);
camera.setRotation(rx, ry, rz);   // radians, applied yaw (Y) → pitch (X) → roll (Z)
camera.setLens({ fovY, near, far });

renderer.loop(() => {
  program.uniforms.uViewProj.set(camera.viewProjection(aspect));
  program.draw();
});
```

The view-projection matrix is cached against position, rotation, lens, and aspect — an unmoved camera costs zero matrix math per frame, and nothing allocates. The GPU sees one mat4 regardless of how the camera moves; all per-vertex transformation stays in the shader.

## Textures and lighting

Declare a `sampler2D` uniform and sample it with the `texture()` intrinsic; light sources are just uniforms your shader math consumes (the full Blinn-Phong lighting model is expressible in the DSL — see the textures-with-light example):

```ts
export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aUv: 'vec2' },
  uniforms: { uViewProj: 'mat4', uLightPos: 'vec3', uTex: 'sampler2D' },
  varyings: { vNormal: 'vec3', vUv: 'vec2' },
  // ...
  fragment({ uLightPos, uTex }, { vNormal, vUv }) {
    const diffuse = max(dot(normalize(vNormal), normalize(uLightPos)), 0);
    return vec4(texture(uTex, vUv).xyz.mul(0.25 + diffuse), 1);
  },
});
```

Texture units are assigned by the compiler and baked into the layout, so the runtime sets each sampler uniform exactly once at link time — `program.uniforms.uTex.set(texture)` only binds. Load textures with `loadTexture(gl, url)` (mipmaps and sensible filtering by default) or wrap any `TexImageSource` with `createTexture`.

## Instancing

Declare per-instance inputs with `instanceAttributes` — they upload to the GPU once and advance per instance, not per vertex:

```ts
export default shader({
  attributes: { aPosition: 'vec3', aColor: 'vec3' },
  instanceAttributes: { iOffset: 'vec3', iAxis: 'vec3', iSpeed: 'float' },
  uniforms: { uViewProj: 'mat4', uTime: 'float' },
  // vertex() receives attributes and instance attributes together
});
```

When a shader declares instance attributes, `program.draw()` automatically uses instanced rendering. The instanced-cubes example renders 125,000 independently tumbling cubes in **one draw call** — each cube's rotation is computed in the vertex shader from a single `uTime` float, so the per-frame CPU→GPU traffic is one mat4 and one float, total.

## Website & examples

The examples live as pages of the BroMetal website (`packages/website`, Next.js):

```bash
npm install
npm run build          # build the brometal package
npm run dev:website    # → http://localhost:3005 (uses the LOCAL workspace package)
npm run prod:website   # → production build against the PUBLISHED npm package
```

Example pages: `/examples/rotating-cube`, `/examples/instanced-cubes`, `/examples/camera`, `/examples/textures-with-light`.

`dev` bundles the local `packages/brometal` source; `prod` sets `BROMETAL_SOURCE=npm`, which aliases every `brometal` import to the published registry package — so the production build exercises exactly what npm users install. A preflight gate compares the published package's export surface against the local one and fails the build if the registry is behind (webpack would otherwise only warn and ship a runtime-broken bundle). To iterate on shaders, run `npm run shaders:watch` in `packages/website` alongside the dev server.

### Deploying to Vercel

1. Import the GitHub repo in Vercel and set **Root Directory** to `packages/website` — everything else is auto-detected (`vercel.json` + the `vercel-build` script).
2. Each deploy builds the workspace compiler, runs the publish preflight, prod-compiles the shaders (minified GLSL), and builds Next against the **published** npm package — so brometal.dev always demos exactly what `npm install brometal` delivers, and the CLI gets exercised in CI on every deploy.
3. `npm run release` handles the version handoff automatically: after publishing it updates `brometal-published` in the website workspace and commits + pushes the lockfile, so the next Vercel deploy builds against the fresh release. If the site ever uses features not yet published, the preflight fails the deploy with instructions instead of shipping a broken page.

## What the DSL supports (MVP)

- Types: `float`, `vec2`, `vec3`, `vec4`, `mat4`, `sampler2D` (uniforms only for `mat4`/`sampler2D`)
- Per-vertex `attributes` and per-instance `instanceAttributes`
- `const` locals, float arithmetic (`+ - * /`), comparisons, `if`/`else`
- Vector methods `.add() .sub() .mul() .div() .scale()`, `mat4.mul()`, swizzles (`.x`, `.xyz`, …)
- Constructors `vec2/vec3/vec4` (composite forms like `vec4(v3, 1)` included)
- Intrinsics: `texture reflect normalize dot cross mix clamp length sin cos abs fract floor sqrt pow min max`

Anything outside the subset fails compilation with a precise, actionable error.

## Compiled, not configured

BroMetal's spirit is to decide everything it can at compile time, so the runtime executes a precomputed plan:

- **Attribute locations** are assigned by the compiler (`layout(location = N)`) and baked into the generated module — the runtime never calls `getAttribLocation`.
- **Buffer layout** (component sizes, instancing divisors) and **uniform upload routines** are chosen at compile time and shipped as metadata.
- **Unused attributes, uniforms, and varyings** are compile-time warnings, not runtime surprises; never-read varyings are stripped from prod builds along with the vertex code that fed them.
- **Fragment precision** is a build flag: `npx brometal prod --precision=mediump` for mobile-leaning targets (default `highp`).

At runtime, the hot path is equally lean: GL state is cached (repeat `useProgram`/VAO binds are skipped), resize handling is `ResizeObserver`-driven so the frame loop never reads DOM layout, `createRenderer` requests the high-performance GPU, opt-in back-face culling (`cull: 'back'`) halves fragment work for closed meshes, and every `mat4` function takes an optional `out` matrix so render loops allocate nothing.

## Repo layout

```
packages/brometal/  # the npm package: compiler, CLI, WebGL2 runtime, camera, textures, mat4 math
packages/website/   # Next.js site (brometal.dev): homepage + all example pages
```

## Development

```bash
npm run build       # compile the package (tsc)
npm test            # vitest: compiler goldens, analyzer errors, optimizer, math, CLI
npm run typecheck   # strict tsc across package + example
```
