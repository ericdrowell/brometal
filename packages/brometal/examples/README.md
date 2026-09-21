# BroMetal examples

Every example from [brometal.dev/examples](https://brometal.dev/examples), copied
here so that you — or an AI coding agent working in your repo — can read real,
working BroMetal code instead of guessing at the API.

**These are reference material, not a runnable app.** Copy from them; do not
import from them.

## Layout

- `shaders/` — the `*.shader.ts` sources. **Read these first.** BroMetal shaders
  are a typed TypeScript DSL, not GLSL strings, and the DSL is the part that is
  easy to get wrong. See `AGENTS.md` in the package root for the rules it
  enforces.
- `demos/` — the runtime code that drives each shader: creating a renderer,
  building geometry, setting uniforms, and the draw loop.

## The build step people miss

A `.shader.ts` file does nothing on its own. It is compiled ahead of time into a
`.shader.gen.ts` module, and **that** is what you import:

```bash
npx brometal dev      # watch mode: recompiles on save
npx brometal dev --once   # one-shot
```

```ts
import cubeShader from './shaders/cube.shader.gen';   // the generated module
```

The `.gen.ts` files are not included here, because your own build produces them.
If you edit a `.shader.ts` and nothing changes on screen, you have almost
certainly not re-run the compiler — that is the single most common mistake.

## Reading the demos

The demos are React components taken from the documentation site, so a few
imports point at site-only chrome under `./_site/` (a frame-rate counter and a
backend badge). Those are not part of BroMetal — delete them. Everything
imported `from 'brometal'` is the real API.

## The examples

- **Rotating Cube** (`rotating-cube`) — Hello world: one spinning cube, a TypeScript shader, and the WebGPU runtime.
- **Quantum Halo** (`lots-of-cubes`) — 120,000 independently lit cuboids form a rippling kinetic sculpture in one draw call.
- **Camera** (`camera`) — Interactive camera: position and rotation sliders driving a cached view-projection matrix.
- **Light** (`light`) — Blinn-Phong lighting on solid-colored faces with a movable point light.
- **Texture** (`textures`) — A lit, textured cube — move the light and pick from nine CC0 textures.
- **Geometry** (`geometries`) — Every built-in geometry — cube, sphere, torus knot, and friends — with a live selector.
- **Shadow** (`shadow`) — Shadow mapping in two passes — geometry rendered from the light into a depth-tested render target, then sampled back with 9-tap PCF.
- **Blend** (`blend`) — One shader, three blend modes — opaque, alpha transparency, and additive glow, switched with a program option.
- **Model** (`model`) — A textured spaceship loaded from a .glb file with loadGlb — CC0 model by Quaternius.
- **Shader Functions** (`shader-functions`) — A visual reference example for every function in brometal/shader-functions — noise, easing, color, lighting, SDFs.
- **Custom Shader** (`custom-shader`) — Procedural plasma written in plain TypeScript — helper functions, let, and for loops compiled to WGSL.
- **Terrain** (`terrain`) — A 65k-vertex plane sculpted into rolling terrain by fbm noise running in the vertex shader.
- **Ripples** (`ripples`) — Elastic ripples rolling across a surface — easing functions driving per-vertex animation on the GPU.
- **Night Ocean** (`night-ocean`) — A moonlit ocean — Gerstner waves in the vertex shader, fbm micro-ripples, fresnel, and a specular glint per pixel.
- **Nanite-Style Teapots** (`nanite-style`) — A 400 × 400 Utah teapot field represents 1.01 billion source triangles with compute culling, GPU-built visibility queues, and indirect LOD draws.
- **Day Ocean** (`day-ocean`) — Eight Gerstner waves shape tropical water with analytic normals, refracted caustics, depth-aware colour, and steepness-driven foam.
- **Brocraft** (`brocraft`) — A blocky voxel world you can fly through — the terrain, every block material, and all the culling are computed in the vertex shader.
- **Star Bro** (`star-bro`) — A playable flight experience — fly the Spitfire through an instanced asteroid field with an additive engine trail and a follow camera.
- **Legend of Bro** (`legend-of-bro`) — A top-down overworld you can walk around — a tilemap and every animated sprite drawn from one atlas in two instanced draw calls.
