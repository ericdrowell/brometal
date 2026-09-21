# Examples gallery competitive research

Research snapshot: 2026-09-20

## Executive read

BroMetal should not try to beat Three.js at raw catalogue size. Its sharper
position is **small runtime, typed TypeScript shaders, spectacular results**.
The examples page therefore has two jobs: create desire quickly, then make the
underlying technique easy to find and inspect.

The previous page was accurate but treated a game, a beginner cube and an ocean
simulation as equivalent text links. The redesigned catalogue adds searchable
technique metadata, stable per-example URLs, and a visual layer with fast previews
that do not allocate dozens of WebGPU contexts.

## What the leading galleries do well

### Three.js

- The official inventory is enormous and uses stable, technique-first names:
  `webgpu_compute_*`, `webgpu_materials_*`, `webgpu_postprocessing_*`,
  `webgpu_tsl_*`, `webgpu_volume_*`, plus physics, XR, loaders and controls.
- That naming turns the gallery into reference documentation. A developer can
  search for a capability rather than needing to know an example's branded title.
- Breadth creates authority, but the list is utilitarian and can be difficult to
  browse for inspiration.

Implication for BroMetal: retain evocative titles, but attach literal tags such
as `voronoi`, `fluid`, `terrain`, `glitch`, and `raymarching`. Search must index
both.

Sources: [official examples](https://threejs.org/examples/),
[official examples inventory](https://threejs.org/examples/files.json)

### TypeGPU

- The gallery leads with a search box and a filter, then mixes polished hero
  pieces (Clouds, Liquid Glass, Stable Fluids, Radiance Cascades) with small
  API proofs (Triangle, Increment, Matrix Multiplication).
- Every example has a full-screen mode and an “Edit on StackBlitz” path. That
  makes examples both marketing and starter projects.
- Its strongest examples name familiar, high-value graphics techniques rather than
  framework primitives.

Implication for BroMetal: distinguish showcase work from learning/reference
work, and make source access part of the example chrome rather than an afterthought.

Sources: [TypeGPU examples](https://docs.swmansion.com/TypeGPU/examples/),
[TypeGPU getting started](https://docs.swmansion.com/TypeGPU/getting-started/)

### vGPU

- The gallery currently spans polished graphics, compute, performance, machine
  learning, and interop. Descriptions state the actual technique and rendering
  pipeline instead of only describing the image.
- Tags such as `black-hole`, `raymarching`, `hdr`, `compute`, and `performance`
  are visible catalogue metadata.
- The same gallery is searchable from the CLI and examples can be pulled into a
  project. This makes the catalogue useful to agents as well as humans.
- Its hero examples set a high visual bar: black-hole lensing, physically based
  atmosphere, interactive fluids, FFT oceans, radiance cascades, and glass.

Implication for BroMetal: make the registry the single source for the visual
gallery, navigation, sitemap, JSON-LD, and `llms.txt`; keep descriptions
specific enough that search and agents can distinguish techniques.

Sources: [vGPU examples](https://vgpu.sh/examples),
[vGPU repository and CLI workflow](https://github.com/vercel-labs/vgpu)

## Information architecture used here

1. **Hero claim** — says what is unique about BroMetal and quantifies the
   catalogue.
2. **One alphabetical gallery** — every example appears exactly once in a
   predictable stream; internal collections do not create competing sections.
3. **Search** — searches title, description, and technique tags, and constrains
   modal previous/next navigation to the results.
4. **Modal exploration** — the gallery stays mounted while a large live viewer
   opens above it; its URL still changes to the example's canonical key.
5. **Individual live routes** — each sketch and 26 selected prebuilt shaders
   has its own canonical URL,
   metadata, source link, previous/next navigation and sitemap entry.

The catalogue deliberately does not count palette, timing, or parameter changes
as separate examples. A new entry must demonstrate a different rendering or
simulation technique.

## Content strategy after this release

- Keep “one remarkable result, one legible technique” as the acceptance bar.
- Prefer multi-pass and compute examples for the next wave; the new shader
  sketches make the gallery visually broad, while BroMetal's strongest technical
  differentiation is GPU-resident state and explicit rendering.
- Add downloadable starter folders when the runtime API stabilizes. This is the
  most useful competitive pattern that is not implemented in this pass.
- Capture real preview stills in CI later. The current CSS previews are fast and
  avoid context exhaustion, but screenshots would better represent the exact
  scene.
