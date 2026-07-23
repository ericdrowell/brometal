# BroMetal

Write TypeScript.  Lift Shaders.  Skip leg day.

BroMetal is LLVM-inspired compiler infrastructure for GPU programming that transforms TypeScript into highly optimized GPU shaders. Today it compiles a typed TypeScript DSL to WebGL2 GLSL (ES 3.00) and ships the WebGL runtime to go with it — buffers, uniforms, program linking, and the render loop are all handled for you.

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

const renderer = createRenderer(canvas);
const program = createProgram(renderer.gl, cubeShader);

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

## Textures and lighting

```ts
uniforms: { uLightPos: 'vec3', uTex: 'sampler2D' },
// ...
fragment({ uLightPos, uTex }, { vNormal, vUv }) {
  const diffuse = max(dot(normalize(vNormal), normalize(uLightPos)), 0);
  return vec4(texture(uTex, vUv).xyz.mul(0.25 + diffuse), 1);
},
```

Texture units are assigned at compile time; `program.uniforms.uTex.set(tex)` only binds. Load with `loadTexture(gl, url)` (mipmapped by default) or wrap any `TexImageSource` with `createTexture`. Lights are plain uniforms — full Blinn-Phong is expressible in the DSL.

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
