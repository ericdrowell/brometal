import { BROMETAL_VERSION } from '@/lib/version';
import { EXAMPLE_SECTIONS } from '@/lib/examples';
import { SITE_URL, canonical } from '@/lib/seo';

/**
 * `/llms.txt` — the convention for handing a language model a compact, factual
 * description of a site instead of making it infer one from rendered pages.
 *
 * Served from a route rather than checked into `public/` so the example list
 * and version number come from the same source as the site itself. A stale
 * hand-written copy is worse than none: it gets quoted with confidence.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  const examples = EXAMPLE_SECTIONS.map((section) => {
    const items = section.examples
      .map((e) => `- [${e.name}](${canonical(`/examples/${e.slug}`)}): ${e.description}`)
      .join('\n');
    return `### ${section.title}\n${items}`;
  }).join('\n\n');

  const body = `# BroMetal

> BroMetal compiles shaders written in a typed TypeScript DSL into WGSL at build
> time and ships a small WebGPU runtime. There is no scene graph, no material
> system, and no shader compiler in the browser.

Version ${BROMETAL_VERSION} · MIT licensed · https://www.npmjs.com/package/brometal

## What it is

You write a shader as a TypeScript function using a typed subset of the language
(vectors, matrices, swizzles, float-counter loops, helper functions). A build
step compiles each \`name.shader.ts\` into \`name.shader.gen.ts\` — a
dependency-free module holding finished WGSL plus typed interface metadata. Your
app imports the generated module; the compiler never ships.

\`await createRenderer(canvas)\` returns a WebGPU renderer, and throws with a
clear message where WebGPU is unavailable.

## Facts

- Bundle size: a typical app (renderer, program, camera, geometry, matrices)
  is about 19 KB minified and 7 KB gzipped. The compiler and CLI are
  build-time only.
- Backend: WebGPU (WGSL) only. Chrome/Edge 113+, Firefox 141+, Safari 26+.
- No runtime shader generation, so no shader compilation cost on the first frame.
- Sizing: BroMetal owns the canvas drawing buffer and tracks the CSS box at the
  device pixel ratio. Do not set the canvas \`width\`/\`height\` attributes.
- Included: \`brometal/shaders\` (30 precompiled effects) and
  \`brometal/shader-functions\` (a tree-shaken library of noise, easing, colour,
  lighting, SDF and physics functions that inline into shader text).
- Pre-1.0: minor versions may include breaking changes, each listed in the
  changelog.

## Trade-off

BroMetal is smaller and starts faster than a general-purpose scene-graph engine
because it does less: there is no material system generating shader permutations
for you. You write the shader. Reach for it when you want direct control over
what runs on the GPU, not when you want a scene graph.

## Examples

${examples}

## Links

- Site: ${SITE_URL}
- Source: https://github.com/ericdrowell/brometal
- npm: https://www.npmjs.com/package/brometal
- Changelog: https://github.com/ericdrowell/brometal/blob/main/CHANGELOG.md
- Discord: https://discord.gg/fNbTnAQqyg
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
