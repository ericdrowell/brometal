# BroMetal — notes for coding agents working *on* this repo

If you are writing an app that *uses* BroMetal, read
[`packages/brometal/AGENTS.md`](packages/brometal/AGENTS.md) instead — it covers
the DSL rules and the failure modes. This file is about the codebase itself.

## Layout

```
packages/brometal/     the library: compiler, runtimes, shader-function library
  src/compiler/        parse → analyze → ir → optimize → emit-glsl / emit-wgsl
  src/runtime/         context, program, uniforms, texture, render-target, loop
  src/dsl/             the types and builtin stubs the DSL is written against
  src/shader-functions/  library-source.ts (GPU source) + index.ts (typed decls)
  src/geometries/      parametric mesh generators
  tests/               vitest, no browser
packages/website/      Next.js site (brometal.dev): home, examples, SEO routes
  src/shaders/         *.shader.ts + generated *.shader.gen.ts
  src/demos/           one client component per example
```

## Commands

```bash
npm test                       # vitest, from the repo root
npm run typecheck              # both packages
npm run build                  # build the library (writes packages/brometal/dist)
npm run dev:website            # site on :3005

# inside packages/website
npm run shaders                # compile *.shader.ts with the LOCAL compiler
```

**Use `npm run shaders`, not `npx brometal`.** The website has a
`brometal-published` dependency (the released package, used to verify prod
builds), and `npx brometal` resolves to *that* — so your local compiler changes
appear to do nothing. `npm run shaders` points at `../brometal/dist`.

**Rebuild the library before recompiling website shaders.** The CLI runs from
`dist`, so a change to `src/compiler` needs `npm run build` first.

## Adding a shader function

Two files, kept in step:

1. `src/shader-functions/library-source.ts` — the GPU source, as a string, with
   a `deps` array naming any other library functions it calls. Dependencies are
   pulled in automatically and tree-shaken if unused.
2. `src/shader-functions/index.ts` — the typed declaration plus a
   `gpuOnly(...)` body, so calling it on the CPU throws with a useful message.

The library test suite is parameterised over every export, so a new function
gets baseline coverage for free — but add a real test for anything with
non-obvious semantics.

## Things that have bitten before

- **WGSL reserved words** — the reserved-for-future list is long and full of
  ordinary names (`type`, `set`, `from`, `match`, `target`, `filter`, …). They
  fail at pipeline creation, which surfaces as a blank canvas. `parse.ts` rejects
  them at build time; keep that list current.
- **WGSL uniformity**: `textureSample` may only be called from uniform control
  flow. Sampling inside an `if` in a fragment stage invalidates the entire
  pipeline and the pass draws nothing, with no error. Helpers emit
  `textureSampleLevel`, which is exempt.
- **Texture V is flipped between backends** for render targets. `targetUv`
  exists for exactly this; do not hand-roll the maths.
- **`glClear` honours the depth write mask.** A blended program leaves depth
  writes off, so a later clear silently no-ops unless `depthMask(true)` is set
  first.
- **The two backends bake different pipeline state.** A WebGPU pipeline encodes
  colour format, sample count and whether depth exists, so a program drawing
  into a render target needs a different pipeline than the same program drawing
  to the screen.

## Conventions

- Comments explain *why*, especially where the code looks odd on purpose. Many
  of the odd-looking lines encode a backend difference; say which.
- The DSL subset is deliberately small. Prefer extending
  `shader-functions` over adding language features.
- Every breaking change goes in `CHANGELOG.md`. The project is pre-1.0 and
  minor versions may break, but silently is not acceptable.
- Types catch signatures, not semantics. Anything visual needs looking at.
