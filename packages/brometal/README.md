# BroMetal

Write TypeScript.  Lift Shaders.  Ship Shredded.

BroMetal is LLVM-inspired compiler infrastructure for GPU programming that transforms TypeScript into highly optimized GPU shaders. It compiles a typed TypeScript DSL to WebGL2 GLSL **and** WGSL from one source, and ships dual WebGL2/WebGPU runtimes — buffers, uniforms, pipelines, program linking, and the render loop are all handled for you. `await createRenderer(canvas)` uses WebGPU when the browser provides it and falls back to WebGL2, behind one typed API.

> **Pre-1.0:** BroMetal is evolving fast. Minor versions may include breaking changes — every one is documented in [CHANGELOG.md](https://github.com/ericdrowell/brometal/blob/main/CHANGELOG.md). The `shader()` DSL and `brometal/shader-functions` surfaces are stable-by-intent; runtime APIs may still shift until 1.0.

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

## The canvas

**Do not set the `width` and `height` attributes.** BroMetal never reads them
and owns the drawing buffer; you own the CSS. A `ResizeObserver` tracks the CSS
box, the buffer follows it at the device pixel ratio, and `renderer.aspect`
stays correct — there is no resize handler to write and no `setSize` to call.

The one rule: **the canvas needs a CSS size, and its container needs a size of
its own.**

```html
<div id="stage">
  <canvas id="scene"></canvas>
</div>
```

```css
#stage {
  width: 100%;
  height: 100vh;      /* a definite size — not height: auto */
}

#stage canvas {
  display: block;     /* a canvas is inline by default, which leaves a gap below it */
  width: 100%;
  height: 100%;
  min-width: 0;       /* flex and grid items refuse to shrink without these */
  min-height: 0;
}
```

```ts
const canvas = document.querySelector('canvas');
const renderer = await createRenderer(canvas);
```

That is all of it. Resize the window, drop the canvas in a flex or grid cell,
put it in a resizable pane — the buffer keeps up on its own.

### Why not the attributes

They are a 2D-canvas legacy and they actively cause trouble here:

- A canvas with no CSS size takes its layout box **from** its drawing buffer, so
  sizing one to the other feeds output back into input. BroMetal detects this,
  leaves the buffer alone, and warns once naming the fix — but you get a fixed
  size that never sharpens on a high-DPI display.
- The attributes set the canvas's *intrinsic* size, which is the automatic
  minimum size of a flex item. `width="800"` plants an 800px floor in the layout
  algorithm, and the canvas overflows its flex container instead of fitting it.

### React

`createRenderer` is async — it probes for a WebGPU adapter before falling back
to WebGL2 — so the component can unmount before it resolves. StrictMode runs
effects twice in development, which makes that the common case rather than the
rare one, so the cancellation flag below is not optional.

```tsx
import { useEffect, useRef } from 'react';
import { createRenderer, createProgram } from 'brometal';
import cubeShader from './shaders/cube.shader.gen';

export function Scene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas);
      if (cancelled) {
        renderer.destroy();
        return;
      }
      const program = createProgram(renderer, cubeShader);
      program.attributes.aPosition.set(positions);
      program.setIndices(indices);

      const stop = renderer.loop(() => program.draw());
      cleanup = () => {
        stop();
        program.dispose();
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // Sized by CSS, like any other element. The parent needs a definite size.
  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />;
}
```

## Camera

```ts
const camera = createCamera({ position: [0, 0, 6] });
camera.setPosition(x, y, z);
camera.setRotation(rx, ry, rz);   // radians, applied yaw (Y) → pitch (X) → roll (Z)
camera.lookAt(x, y, z);           // aim at a world position

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

Included: `hash11 hash21 hash22 hash31` · `vnoise2 gnoise2 fbm2 gfbm2 turbulence2 warp2 voronoi2 worleyEdge2 curl2 vnoise3 fbm3` · `remap smootherstep rotate2 rotate3 gerstnerWave` · easings (`quad/cubic/sine/expo/back/elastic/bounce` families) · `luminance rgb2hsv hsv2rgb cosinePalette adjustSaturation brightnessContrast blendScreen blendOverlay tonemapACES tonemapReinhard gammaCorrect filmGrain` · `lambert blinnPhongSpec specGGX fresnel toonShade hemisphereLight` · `sdCircle sdBox2 sdRoundedBox2 sdHexagon sdSegment2 smoothUnion smoothSubtract smoothIntersect fillAA strokeAA` · `sdSphere3 sdBox3 sdTorus3 sdCapsule3 sdOctahedron3 sdPlane3`

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

## Models

`loadGlb(url)` fetches and parses a glTF-Binary (.glb) file into attribute-ready typed arrays — positions, normals, uvs, indices — plus any embedded images:

```ts
const model = await loadGlb('/models/ship.glb');
const mesh = model.meshes[0];
program.attributes.aPosition.set(mesh.positions);
program.attributes.aNormal.set(mesh.normals!);
program.attributes.aUv.set(mesh.uvs!);
program.setIndices(mesh.indices!);
const image = model.images[mesh.imageIndex!];
const bitmap = await createImageBitmap(new Blob([image.data], { type: image.mimeType }));
program.uniforms.uTex.set(createTexture(renderer, bitmap, { flipY: false }));
```

Scope: triangle primitives with embedded (GLB-chunk) buffers and images. Draco compression, skinning, node transforms, and external URIs are not supported; `parseGlb(bytes)` is the fetch-free variant.

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

- Website & live examples: https://brometal.dev
- Source and issues: https://github.com/ericdrowell/brometal
- Discord — questions, showcase, and release chat: https://discord.gg/fNbTnAQqyg
