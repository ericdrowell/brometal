// Copies the website's examples into the published package so that an AI coding
// agent working in a consumer's repo has real, working reference material.
//
// Why this exists: BroMetal's shaders are a TypeScript DSL, not GLSL. An agent
// that has only seen the README will write GLSL-shaped code that does not
// compile. Shipping the actual shader sources is the difference between an agent
// guessing at the DSL and copying a form it can see works.
//
// The copies must read as if written against the published package: imports say
// `from 'brometal'`, and the website's `@/shaders/...` path alias is rewritten to
// a relative path, since nothing outside the Next app resolves it.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const websiteSrc = join(root, 'packages/website/src');
const outDir = join(root, 'packages/brometal/examples');

/** Pull the example catalogue out of the website's registry. */
function readCatalogue() {
  const source = readFileSync(join(websiteSrc, 'lib/examples.ts'), 'utf8');
  const entries = [];
  const pattern =
    /slug:\s*'([^']+)',\s*name:\s*'([^']+)',\s*description:\s*\n?\s*'([^']*(?:''[^']*)*)'/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    entries.push({ slug: match[1], name: match[2], description: match[3].replace(/\\'/g, "'") });
  }
  return entries;
}

/**
 * Rewrite website-only imports.
 *
 * `@/shaders/x.shader.gen` becomes a relative path. The `.gen` modules are
 * generated rather than copied — shipping them would double the package for
 * files the consumer's own build produces — so the README explains that running
 * the CLI creates them.
 */
function rewrite(source) {
  return source
    .replace(/from '@\/shaders\/([^']+)'/g, "from '../shaders/$1'")
    .replace(/from '@\/components\/([^']+)'/g, "from './_site/$1'")
    .replace(/from '@\/demos\/([^']+)'/g, "from './$1'");
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'shaders'), { recursive: true });
mkdirSync(join(outDir, 'demos'), { recursive: true });

// Shader sources only. The .gen.ts modules next to them are build output.
const shaderDir = join(websiteSrc, 'shaders');
const shaders = readdirSync(shaderDir).filter(
  (name) => name.endsWith('.shader.ts') && !name.endsWith('.shader.gen.ts'),
);
for (const name of shaders) {
  writeFileSync(join(outDir, 'shaders', name), rewrite(readFileSync(join(shaderDir, name), 'utf8')));
}

const demoDir = join(websiteSrc, 'demos');
const demos = readdirSync(demoDir).filter((name) => name.endsWith('.tsx'));
for (const name of demos) {
  writeFileSync(join(outDir, 'demos', name), rewrite(readFileSync(join(demoDir, name), 'utf8')));
}

// The changelog is readable in three places — GitHub, brometal.dev/changelog,
// and node_modules — and all three must be the same file. The website renders
// the repository copy directly; this mirrors it into the package so a consumer
// can read it without leaving their editor. Copied rather than hand-maintained,
// because a second copy always drifts.
copyFileSync(join(root, 'CHANGELOG.md'), join(root, 'packages/brometal/CHANGELOG.md'));

const catalogue = readCatalogue();
const index = catalogue.map((e) => `- **${e.name}** (\`${e.slug}\`) — ${e.description}`).join('\n');

writeFileSync(
  join(outDir, 'README.md'),
  `# BroMetal examples

Every example from [brometal.dev/examples](https://brometal.dev/examples), copied
here so that you — or an AI coding agent working in your repo — can read real,
working BroMetal code instead of guessing at the API.

**These are reference material, not a runnable app.** Copy from them; do not
import from them.

## Layout

- \`shaders/\` — the \`*.shader.ts\` sources. **Read these first.** BroMetal shaders
  are a typed TypeScript DSL, not GLSL strings, and the DSL is the part that is
  easy to get wrong. See \`AGENTS.md\` in the package root for the rules it
  enforces.
- \`demos/\` — the runtime code that drives each shader: creating a renderer,
  building geometry, setting uniforms, and the draw loop.

## The build step people miss

A \`.shader.ts\` file does nothing on its own. It is compiled ahead of time into a
\`.shader.gen.ts\` module, and **that** is what you import:

\`\`\`bash
npx brometal dev      # watch mode: recompiles on save
npx brometal dev --once   # one-shot
\`\`\`

\`\`\`ts
import cubeShader from './shaders/cube.shader.gen';   // the generated module
\`\`\`

The \`.gen.ts\` files are not included here, because your own build produces them.
If you edit a \`.shader.ts\` and nothing changes on screen, you have almost
certainly not re-run the compiler — that is the single most common mistake.

## Reading the demos

The demos are React components taken from the documentation site, so a few
imports point at site-only chrome under \`./_site/\` (a frame-rate counter and a
backend badge). Those are not part of BroMetal — delete them. Everything
imported \`from 'brometal'\` is the real API.

## The examples

${index}
`,
);

console.log(
  `✓ examples → packages/brometal/examples (${shaders.length} shaders, ${demos.length} demos, ${catalogue.length} catalogued)`,
);
console.log('✓ CHANGELOG.md → packages/brometal/CHANGELOG.md');
