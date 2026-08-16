# BroMetal js13k starter

A spinning textured cube in **2,989 bytes zipped**, leaving ~10.3 kB of the
13 kB budget for your game. Shaders are written in TypeScript and compiled to
WGSL at build time — the compiler never ships.

```bash
npm install
npm run build
open dist/index.html
```

Everything is inlined into that one file, so you can open it straight from disk.
No server: `file://` is a secure context, and WebGPU works there.

The build prints your budget and **fails if the zip exceeds 13,312 bytes**:

```
  index.html   6175 bytes
  game.zip     2989 bytes
  budget       2989 / 13312  (22.5%)

✓ 10323 bytes remaining
```

## Layout

| | |
|---|---|
| `src/*.shader.ts` | shaders, in BroMetal's typed DSL |
| `src/game.js` | your game — plain globals, no imports |
| `src/index.html` | the page shell; the build inlines the script into a copy |
| `dist/brometal.js` | generated: the runtime |
| `dist/shaders.js` | generated: your compiled shaders |
| `dist/index.html` | **the whole game in one file** — open this |
| `dist/game.zip` | what you submit |

Everything you write lives in `src/`; everything in `dist/` is generated and
gitignored, so it is always safe to delete.

## How the build works

1. `brometal prod --js13k` compiles `src/*.shader.ts` into `dist/shaders.js` and
   writes the runtime to `dist/brometal.js` from the same version.
2. Runtime + shaders + your game are concatenated into one program.
3. `terser --toplevel --mangle` minifies all of it in a single pass.
4. The result is inlined into a copy of `src/index.html`, written to
   `dist/index.html`, and zipped.

Step 3 is why the runtime ships as readable source: minified jointly, the mangler
renames its API and deletes every function you never call. A prebuilt bundle
could do neither.

Step 4 matters more than it looks — a zip charges per member for its local header
and central directory record, so one file beats two by about 150 bytes.

## Writing a shader

Add `src/thing.shader.ts` exporting `export const Thing = shader({...})` and it becomes the global `Thing`:

```js
const Thing = ["...wgsl...", [3,3,2], [], 160, [[1,2]], [[3,1]]];
//                               attrs   inst  bytes  [tex,sampler]  [binding,written]
```

Pass it straight to `bmProgram`:

```js
const p = bmProgram(Thing[0], {
  a: Thing[1], i: Thing[2], u: Thing[3], t: Thing[4], s: Thing[5],
  cull: 1,          // blend: 1 and zwrite: 0 for transparent passes
});
```

The last slot is only there for a shader that declares `storage`, so most
shaders emit five entries and `s` is simply undefined.

## API

```
bmInit(canvas, clearColor)        bmTexture(source, smooth)     bmPersp(fov, aspect, near, far)
bmProgram(wgsl, opts)             bmTextures(prog, ...textures) bmLook(eye, at, up)
bmAttr(prog, slot, floats)        bmUniforms(prog, floats)      bmMul(a, b)  bmIdentity()
bmIndex(prog, uint16s)            bmDraw(prog, instanceCount)   bmTrans/bmScale/bmRotX/Y/Z
bmBuffer(data, isIndex)           bmLoop(callback)              bmSave() / bmRestore() / bmM

bmCompute(wgsl, opts)             bmStore(typedArray)
bmStorages(prog, ...buffers)      bmDispatch(prog, x, y, z)

bmTarget(width, height)           bmPassTo(target)   // omit target for the screen
```

Uniforms are a flat `Float32Array` — no names ship. The float offsets for each
shader are written as a comment above its entry in `dist/shaders.js`.

## Compute

A shader with a `compute()` stage goes to `bmCompute` instead of `bmProgram` —
same descriptor, `cs_main` instead of the draw pair. State lives in a storage
buffer, and the same buffer can be bound to a program that draws:

```js
const state = bmStore(new Float32Array(4));   // zeroed: pure output

const sim = bmCompute(Sim[0], { u: Sim[3], s: Sim[5] });
bmStorages(sim, state);

const draw = bmProgram(Thing[0], { a: Thing[1], u: Thing[3], s: Thing[5] });
bmStorages(draw, state);                      // one buffer, two programs

bmLoop(() => {
  bmDispatch(sim, 1);                         // lands before this frame's draws
  bmDraw(draw);
});
```

Two rules that are not obvious and fail without a useful error:

- **The shader that writes the buffer and the shader that reads it must be
  different programs.** WebGPU forbids a `read_write` storage binding from being
  visible to the vertex stage. The restriction is on the binding, not the
  buffer — so the compute shader declares it and writes, the render shader
  declares it and only reads, and the compiler marks each side accordingly.
- **`bmDispatch` inside `bmLoop` runs before that frame's drawing.** The loop
  submits after your callback returns, so your dispatch is queued first and work
  runs in submission order. No readback, nothing a frame stale.

The tiny runtime has no way to read a buffer back to JavaScript. State that the
GPU owns, the GPU keeps — if the CPU needs a number, keep that number on the CPU.

## Render targets

Draw the frame into a texture, then draw *with* that texture: blur, bloom, a
half-resolution pass, anything that needs a second look at what you just drew.

```js
const scene = bmTarget(canvas.width, canvas.height);
// Programs that draw into a target need fmt: 1 — a pipeline's colour format is
// fixed when it is built and has to match the attachment.
const world = bmProgram(World[0], { a: World[1], u: World[3], fmt: 1 });
const post  = bmProgram(Post[0],  { a: Post[1],  u: Post[3], t: Post[4] });

bmLoop(() => {
  bmPassTo(scene);          // the world, into the target
  bmDraw(world);
  bmPassTo();               // back to the screen
  bmTextures(post, scene);  // a target is a texture; bind it as one
  bmDraw(post);
});
```

Three things that are not obvious:

- **Targets are `rgba16float`, not the canvas format**, and that is most of the
  point. An 8-bit target clamps at 1 on the way in, so a bright-pass looking for
  what came out brighter than white finds it was thrown away before it ran.
- **A target clears when its pass opens; the canvas loads.** `bmLoop` already
  cleared the canvas when the frame began, and clearing it again on the way back
  would throw away everything drawn before the detour.
- **Sample it with `targetUv(clipPosition)`, not by hand.** A target's rows run
  top to bottom while NDC +y points at the first of them, so `ndc * 0.5 + 0.5`
  reads it upside down.

`bmStorages` binds positionally, and `dist/shaders.js` writes the order above
each shader as a comment.

## Requires WebGPU

Shaders compile to WGSL, so this needs WebGPU: Chrome/Edge 113+, Firefox 141+,
Safari 26+. Judges play entries in whatever browser they have, so weigh that
before committing.

One trap worth knowing: `file://` and `localhost` are secure contexts, but a bare
LAN address over plain HTTP (`http://192.168.x.x`) is not — `navigator.gpu` is
undefined there even in a capable browser. Testing on a phone needs HTTPS or a
tunnel.
