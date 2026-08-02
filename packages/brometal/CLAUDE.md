# BroMetal — for AI coding agents

You are writing an app that uses BroMetal. Read this before writing any shader.

BroMetal compiles shaders written as **typed TypeScript** into WGSL **at build
time**, and ships a WebGPU runtime behind one API. There is no scene graph, no
material system, and no shader compiler in the browser.

- **[`AGENTS.md`](AGENTS.md)** — the complete DSL reference. Read it before
  anything non-trivial.
- **[`examples/`](examples/)** — every example from brometal.dev as real source.
  `examples/shaders/` is the fastest way to learn the DSL by pattern.

---

## Shaders are TypeScript, not shader-language strings

This is the thing agents get wrong. Do **not** write WGSL and pass it as a
string — there is no API that accepts one. Write this:

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

## The build step

A `.shader.ts` does nothing on its own. It compiles to a sibling
`.shader.gen.ts`, and **that** is what the app imports:

```bash
npx brometal dev          # watch mode
npx brometal dev --once   # one-shot
```

```ts
import cubeShader from './shaders/cube.shader.gen';   // .gen, not .shader
```

**If a shader edit has no effect, it was not recompiled.** Nothing at runtime
reads `.shader.ts`. This is the most common problem people hit, and it produces
no error.

## Running it

```ts
import { createRenderer, createProgram, mat4 } from 'brometal';
import cubeShader from './shaders/cube.shader.gen';

const renderer = await createRenderer(canvas);   // WebGPU; throws where unavailable
const program = createProgram(renderer, cubeShader);

program.attributes.aPosition.set(positions);   // Float32Array
program.setIndices(indices);

renderer.loop((t) => {
  program.uniforms.uMvp.set(mat4.multiply(projection, mat4.rotationY(t)));
  program.draw();
});
```

---

## Rules the DSL enforces

Compile errors with file, line and column. Read the message — it names the fix.

- **One `return`**, as the final top-level statement of `vertex`/`fragment`. No
  early returns. `vertex` returns a `vec4` clip position; `fragment` a `vec4`
  colour. `vertex` must assign **every** declared varying.
- **No arrays, no structs, no `while`, no `switch`, no `break`.** `for` loops
  need a float counter: `for (let i = 0; i < n; i += 1)`.
- **Module-level constants are not in scope.** Declare consts *inside* the
  function that uses them — `const SIZE = 128` at module level will not resolve.
- **Helper functions** must be module-level `function` declarations with typed
  params, declared above first use. Params may be `number, Vec2, Vec3, Vec4,
  Mat4, Sampler2D, Sampler3D`.
- **Vector maths is method calls**, not operators: `a.add(b)`, `a.sub(b)`,
  `a.mul(b)`, `a.scale(k)`, `m.mul(v)`. `a + b` on two vectors will not compile.
  Swizzles read normally: `v.xyz`, `v.x`.
- **These intrinsics take floats only** — passing a vector is a compile error:
  `sin cos tan asin acos atan abs sign fract floor sqrt exp exp2 log pow min max
  mod step smoothstep`. For a component-wise vector `max`, do it per component.

## Failures that are silent

These produce a black screen or wrong output with **no error message**.

- **Reserved words.** WGSL reserves a long list of ordinary-looking words for
  future use — `type`, `set`, `get`, `from`, `new`, `use`, `with`, `where`,
  `match`, `self`, `null`, `pass`, `target`, `filter`, `precise`, `shared`.
  BroMetal rejects them at build time, so this surfaces as a name error rather
  than a pipeline that silently never creates.
- **`texture()` inside an `if`.** WGSL requires texture sampling in uniform
  control flow; sampling inside a conditional invalidates the *whole pipeline*
  and the pass draws nothing. Sample unconditionally and multiply the result
  away. (Inside a helper function the emitter uses an explicit-LOD form, which is
  exempt — but it always samples LOD 0.)
- **Sampling a render target needs `targetUv`.** NDC +y lands on a target's
  *first* row while texture v runs top-down, so hand-rolling
  `clip.xy / clip.w * 0.5 + 0.5` reads the target vertically mirrored — which
  shows up as a lighting bug, not a coordinate one.
- **Render targets are RGBA16F and sampled NEAREST, clamped.** They hold numbers,
  not pictures. Interpolation and tiling wrap must be done by hand.

## Compute

Work dispatched over a grid rather than driven by geometry. A compute stage
writes to storage buffers; nothing else can.

```ts
shader({
  uniforms: { uCount: 'float' },
  storage: { uOut: 'vec4' },          // declared by ELEMENT type
  workgroupSize: [64, 1, 1],
  compute({ uOut, uCount }, id) {
    storageWrite(uOut, id.x, vec4(id.x / uCount, 0, 0, 1));
  },
});
```

Storage access is `storageRead(buffer, index)` / `storageWrite(buffer, index,
value)` / `storageLength(buffer)` — **not** `buffer[i]`. The DSL has no indexing.
Run it with `program.dispatch(x, y, z)`, where the counts are workgroups rather
than threads.
