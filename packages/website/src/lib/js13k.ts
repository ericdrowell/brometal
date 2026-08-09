import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildJs13kRuntime } from 'brometal/js13k';

/**
 * The js13k page's contents, assembled at build time from the real artifacts.
 *
 * Nothing here is a transcription. The runtime is the installed package's own
 * compiled core put through the same `stripModuleSyntax` the CLI uses, and the
 * game and shader are the files the starter template actually builds. A page
 * that retyped any of it would be wrong the first time one of them changed, and
 * wrong silently — the reader would copy code that no longer matches the tool.
 */

/** Repo root. process.cwd() is packages/website under `next dev` and `next build`. */
function repoRoot(): string {
  return join(process.cwd(), '..', '..');
}

/**
 * The installed package root.
 *
 * Found by looking rather than by `require.resolve`: Next's bundler rewrites
 * `createRequire` in a server component and the resolved path came back as a
 * number, failing at prerender with an error that names neither cause. Plain
 * filesystem paths are what the changelog page uses for the same reason.
 */
function packageRoot(): string {
  const candidates = [
    join(process.cwd(), 'node_modules', 'brometal'),
    join(repoRoot(), 'node_modules', 'brometal'),
    join(repoRoot(), 'packages', 'brometal'),
  ];
  const found = candidates.find((dir) => existsSync(join(dir, 'dist', 'tiny', 'index.js')));
  if (found === undefined) {
    throw new Error(
      `brometal's compiled core was not found (looked in ${candidates.join(', ')}). Run \`npm run build\`.`,
    );
  }
  return found;
}

export interface Js13kSource {
  /** The runtime, exactly as `brometal prod --js13k` writes it. */
  runtime: string;
  /** The starter's game code. */
  game: string;
  /** The starter's shader, in the typed DSL. */
  shader: string;
  /** The page the game draws into. */
  indexHtml: string;
  /** Minified + gzipped size of the runtime, in bytes. */
  runtimeGzip: number;
}

export function readJs13kSource(): Js13kSource {
  const pkg = packageRoot();
  // Built by the CLI's own function, so the page shows byte-for-byte what
  // `brometal prod --js13k` writes — header included. Two files in dependency
  // order: the stateless facts, then the core that uses them.
  const { version } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as {
    version: string;
  };
  const runtime = buildJs13kRuntime(
    ['dist/tiny/gpu.js', 'dist/tiny/index.js'].map((part) =>
      readFileSync(join(pkg, part), 'utf8'),
    ),
    version,
  );

  const template = join(repoRoot(), 'templates', 'js13k');
  return {
    runtime,
    game: readFileSync(join(template, 'game.js'), 'utf8'),
    shader: readFileSync(join(template, 'src', 'cube.shader.ts'), 'utf8'),
    indexHtml: readFileSync(join(template, 'index.html'), 'utf8'),
    // Reported unminified here — the page states the measured figure from the
    // build gate rather than approximating it from raw source.
    runtimeGzip: gzipSync(Buffer.from(runtime), { level: 9 }).length,
  };
}
