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
const Thing = ["...wgsl...", [3,3,2], [], 160, [[1,2]]];
//                               attrs   inst  bytes  [tex,sampler]
```

Pass it straight to `bmProgram`:

```js
const p = bmProgram(Thing[0], {
  a: Thing[1], i: Thing[2], u: Thing[3], t: Thing[4],
  cull: 1,          // blend: 1 and zwrite: 0 for transparent passes
});
```

## API

```
bmInit(canvas, clearColor)        bmTexture(source, smooth)     bmPersp(fov, aspect, near, far)
bmProgram(wgsl, opts)             bmTextures(prog, ...textures) bmLook(eye, at, up)
bmAttr(prog, slot, floats)        bmUniforms(prog, floats)      bmMul(a, b)  bmIdentity()
bmIndex(prog, uint16s)            bmDraw(prog, instanceCount)   bmTrans/bmScale/bmRotX/Y/Z
bmBuffer(data, isIndex)           bmLoop(callback)              bmSave() / bmRestore() / bmM
```

Uniforms are a flat `Float32Array` — no names ship. The float offsets for each
shader are written as a comment above its entry in `dist/shaders.js`.

## Requires WebGPU

Shaders compile to WGSL, so this needs WebGPU: Chrome/Edge 113+, Firefox 141+,
Safari 26+. Judges play entries in whatever browser they have, so weigh that
before committing.

One trap worth knowing: `file://` and `localhost` are secure contexts, but a bare
LAN address over plain HTTP (`http://192.168.x.x`) is not — `navigator.gpu` is
undefined there even in a capable browser. Testing on a phone needs HTTPS or a
tunnel.
