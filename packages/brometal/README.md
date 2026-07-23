# BroMetal

Write TypeScript.  Lift Shaders.  Ship Shredded.

BroMetal is LLVM-inspired compiler infrastructure for GPU programming that transforms TypeScript into highly optimized GPU shaders. It compiles a typed TypeScript DSL to WebGL2 GLSL **and** WGSL from one source, and ships dual WebGL2/WebGPU runtimes — buffers, uniforms, pipelines, program linking, and the render loop are all handled for you. `await createRenderer(canvas)` uses WebGPU when the browser provides it and falls back to WebGL2, behind one typed API.

## Install

```bash
npm install brometal
```

## Write a shader in TypeScript

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

## Compile it

```bash
npx brometal dev    # compile all *.shader.ts and watch for changes
npx brometal prod   # one-shot optimized build (constant folding + minified GLSL)
```

Each `name.shader.ts` compiles to a sibling `name.shader.gen.ts` — a dependency-free module with the GLSL plus typed interface metadata. Your app imports the generated module; the compiler never reaches your bundle.

## Render

```ts
import { createRenderer, createProgram, mat4 } from 'brometal';
import cubeShader from './shaders/cube.shader.gen';

const renderer = await createRenderer(canvas);   // WebGPU when available, WebGL2 otherwise
const program = createProgram(renderer, cubeShader);

program.attributes.aPosition.set(positions);
program.attributes.aColor.set(colors);
program.setIndices(indices);

renderer.loop((t) => {
  program.uniforms.uMvp.set(mat4.multiply(projection, mat4.multiply(view, mat4.rotationY(t))));
  program.draw();
});
```

Everything is typed end-to-end: the records in `shader()` drive the GLSL declarations, the generated metadata, and the `program.attributes.*` / `program.uniforms.*` accessors. A typo'd uniform name is a compile error in your app; the shader compiler enforces the varyings contract with `file:line:col` diagnostics.

## Camera

```ts
const camera = createCamera({ position: [0, 0, 6] });
camera.setPosition(x, y, z);
camera.setRotation(rx, ry, rz);   // radians, applied yaw (Y) → pitch (X) → roll (Z)

renderer.loop(() => {
  program.uniforms.uViewProj.set(camera.viewProjection(aspect));
  program.draw();
});
```

The view-projection matrix is cached against position, rotation, lens, and aspect — an unmoved camera costs zero matrix math per frame, and nothing allocates.

## Prebuilt shaders

`brometal/shaders` ships 30 complete, ready-to-draw shaders — fire, caustics, domain warp, a raymarched scene, CRT/glitch/halftone image effects, and more — precompiled at package build time. Zero shader compilation happens in your app:

```ts
import { createRenderer, createProgram, createPlane } from 'brometal';
import { fireShader } from 'brometal/shaders';

const renderer = await createRenderer(canvas);
const program = createProgram(renderer, fireShader);
// set a fullscreen quad + uTime/uAspect per frame — that's it
```

Every prebuilt targets a fullscreen quad (`aPosition`/`aUv` from `createPlane({ width: 2, height: 2 })`) with `uTime`/`uAspect` uniforms; image effects add a `uTex` sampler.

## Shader functions

`brometal/shader-functions` ships a curated library of typed GPU functions — noise, hash, easing, color, lighting, and 2D SDFs — that inline into your shader at build time. Import them like any TypeScript function:

```ts
import { shader, vec2, vec3, vec4 } from 'brometal';
import { fbm2, cosinePalette } from 'brometal/shader-functions';

export default shader({
  // ...
  fragment({ uTime }, { vUv }) {
    const n = fbm2(vUv.scale(4).add(vec2(uTime, 0)), 5);
    return vec4(cosinePalette(n, a, b, c, d), 1);
  },
});
```

The compiler resolves imports (and their dependencies — `fbm2` pulls in `vnoise2` and `hash21` automatically), type-checks every call against the library signatures, and emits only the functions each stage actually uses — into both GLSL and WGSL. Nothing ships at runtime; it's tree-shaken shader text.

Included: `hash11 hash21 hash22 hash31` · `vnoise2 gnoise2 fbm2 turbulence2 warp2 voronoi2 worleyEdge2 curl2 vnoise3 fbm3` · `remap smootherstep rotate2` · easings (`quad/cubic/sine/expo/back/elastic/bounce` families) · `luminance rgb2hsv hsv2rgb cosinePalette adjustSaturation brightnessContrast blendScreen blendOverlay tonemapACES tonemapReinhard gammaCorrect filmGrain` · `lambert blinnPhongSpec specGGX fresnel toonShade hemisphereLight` · `sdCircle sdBox2 sdRoundedBox2 sdHexagon sdSegment2 smoothUnion smoothSubtract smoothIntersect fillAA strokeAA` · `sdSphere3 sdBox3 sdTorus3 sdCapsule3 sdOctahedron3 sdPlane3`

Because every function is typed and compile-checked, they're also ideal building blocks for AI coding agents: an agent composing known-good primitives with signatures it cannot violate beats one hand-deriving noise math every time.

## Textures and lighting

```ts
uniforms: { uLightPos: 'vec3', uTex: 'sampler2D' },
// ...
fragment({ uLightPos, uTex }, { vNormal, vUv }) {
  const diffuse = max(dot(normalize(vNormal), normalize(uLightPos)), 0);
  return vec4(texture(uTex, vUv).xyz.mul(0.25 + diffuse), 1);
},
```

Texture units are assigned at compile time; `program.uniforms.uTex.set(tex)` only binds. Load with `loadTexture(renderer, url)` (mipmapped by default) or wrap any `TexImageSource` with `createTexture`. Lights are plain uniforms — full Blinn-Phong is expressible in the DSL.

## Instancing

Declare per-instance inputs with `instanceAttributes` — they upload once and advance per instance, not per vertex. When a shader declares them, `program.draw()` automatically renders instanced:

```ts
export default shader({
  attributes: { aPosition: 'vec3', aColor: 'vec3' },
  instanceAttributes: { iOffset: 'vec3', iAxis: 'vec3', iSpeed: 'float' },
  uniforms: { uViewProj: 'mat4', uTime: 'float' },
  // ...
});
```

Thousands of independently animated objects, one draw call, one mat4 + one float uploaded per frame.

## What the DSL supports

- Types: `float`, `vec2`, `vec3`, `vec4`, `mat4`, `sampler2D` (uniforms only for `mat4`/`sampler2D`)
- Per-vertex `attributes` and per-instance `instanceAttributes`
- `const` and mutable `let` locals, float arithmetic (`+ - * /`), compound assignment (`+= -= *= /=`, `x++`), comparisons, `if`/`else`
- `for` loops with float counters — `for (let i = 0; i < n; i += 1)`
- Module-level **helper functions** with typed signatures (`function palette(t: number): Vec3`), compiled to GLSL functions; helpers can call earlier helpers
- Vector methods `.add() .sub() .mul() .div() .scale()`, `mat4.mul()`, swizzles (`.x`, `.xyz`, …)
- Constructors `vec2/vec3/vec4` (composite forms like `vec4(v3, 1)` included)
- Intrinsics: `texture reflect normalize dot cross mix clamp length distance sin cos tan asin acos atan abs sign fract floor sqrt pow exp exp2 log mod step smoothstep min max`

Anything outside the subset fails compilation with a precise, actionable error.

## Links

Source, examples (rotating cube, 1,000 instanced cubes), and issues: https://github.com/ericdrowell/brometal
