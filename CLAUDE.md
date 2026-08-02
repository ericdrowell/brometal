# Working on BroMetal

Instructions for Claude working **on this repository**. If you are writing an app
that *uses* BroMetal, read [`packages/brometal/AGENTS.md`](packages/brometal/AGENTS.md)
instead.

Start with [`AGENTS.md`](AGENTS.md) at this root — it covers the layout, the
commands, and the failure modes that have bitten before. This file adds the
things that are easy to skip.

---

## Always update the changelog

**Any change under `packages/brometal/` gets a `CHANGELOG.md` entry in the same
change.** Not at release time, not "later" — now, while you still remember why.

The log currently jumps from `## Unreleased` straight to `0.7.0`. Versions 0.8
through 0.12 shipped with no entries at all, because writing them was a separate
step that got skipped. That is the failure this rule exists to prevent.

Add to the `## Unreleased` section at the top. **Never write a version number** —
the version is not chosen until `npm run release` runs, and the release script
promotes `## Unreleased` to `## <version> (<date>)` and opens a fresh empty one.

There are exactly three sections, and they always appear in this order:

1. `### Added` — new API surface
2. `### Improved` — existing behaviour made better, including breaking changes
3. `### Fixed` — a bug that shipped

There is no `Changed`. Every change is an addition, an improvement, or a fix.

**Never create a second section with the same name.** Add your bullet to the
existing `### Added` / `### Improved` / `### Fixed`, creating it only if absent.
Appending a fresh `### Added` at the bottom of the section is the easy mistake —
it renders as two separate lists and the reader cannot tell why.

Mark anything source-incompatible **Breaking**, in `Improved`, and say what to do
instead.

Changes that do **not** need an entry: website content, README edits, tests,
comments, and internal refactors with no behavioural difference.

### Only edit the root file

`/CHANGELOG.md` is the source of truth. Two things derive from it:

- **The website** (`/changelog`) parses the root file at build time. No copy
  exists, so it cannot drift.
- **`packages/brometal/CHANGELOG.md`** is a copy written by `npm run
  sync:examples`, so the file is readable from `node_modules`. **Never edit it** —
  the next sync overwrites it silently. It is committed rather than gitignored
  because npm falls back to `.gitignore` in the absence of an `.npmignore`, and an
  ignored file would not ship.

`packages/brometal/examples/` is generated the same way, from
`packages/website/src/{shaders,demos}`. Edit the website sources, not the copies.

---

## Verify before claiming

`npm test` passing is necessary and **not sufficient** for compiler work. The
test suite compiles shaders; it does not run them on a GPU.

Bugs that passed a green suite in this repo:

- `storageRead`/`storageLength` emitted as literal calls — invalid WGSL
- `struct BmVSIn {}` emitted for compute-only shaders — WGSL rejects empty
  structs, and it fails at *pipeline creation*, not compile time
- The WebGPU uniform setter branching only on `sampler2D`, silently dropping
  `sampler3D`
- Uniforms never flushed for `dispatch()`, so compute read zeros — no error at
  all, just wrong numbers

**Dump the emitted WGSL and read it.** For anything that renders, look at
the actual pixels before saying it works.

For runtime changes — `runtime/webgpu.ts`, bind groups, pipelines, uniform
uploads — run `npm run test:gpu`. It drives the system Chrome against a real GPU
and asserts on pixels, which is the only thing that catches a valid-looking
shader wired up wrongly. It is not part of `npm test`, because it needs a GPU and
a Chrome install.

---

## Order of operations

The shader CLI runs from `packages/brometal/dist`, so a compiler change does
nothing until the library is rebuilt:

```bash
npm run build      # library → dist        (required after compiler changes)
npm run shaders    # *.shader.ts → *.gen.ts
npm run dev:website
```

Use `npm run shaders`, never `npx brometal` — the website also depends on
`brometal-published`, and `npx` resolves to that, so local compiler changes
appear to do nothing.

---

## Conventions

- Comments explain *why*, especially where code looks odd on purpose. Many of the
  odd-looking lines encode a backend difference; say which.
- Prefer extending `shader-functions` over adding DSL language features.
- Do not edit `*.shader.gen.ts` by hand — they are build output.
- Types catch signatures, not semantics. Anything visual needs looking at.
