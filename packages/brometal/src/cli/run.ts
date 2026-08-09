import { watch } from 'chokidar';
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileShaderSource } from '../compiler/compile.js';
import { buildGeneratedModule, shaderNameFromFile } from '../compiler/emit-module.js';
import { CompileError } from '../compiler/errors.js';
import {
  buildJs13kRuntime,
  buildJs13kShader,
  buildJs13kShaderFile,
  js13kNameError,
} from '../js13k/emit.js';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git']);

const HELP = `BroMetal — compile TypeScript shaders to WGSL

Usage:
  brometal dev [dir]          Compile all *.shader.ts files and watch for changes
  brometal dev --once         Compile once without watching (readable output)
  brometal prod [dir]         Compile once with optimizations (constant folding
                              and dead-varying elimination)
  brometal prod --js13k       Emit a js13k bundle instead of .gen.ts modules

Each src/**/name.shader.ts compiles to a sibling name.shader.gen.ts that your
app imports and passes to createProgram().

--js13k writes brometal.js (a global-function WebGPU runtime) and shaders.js
(compact descriptors) into ./js13k. Both are SOURCE: concatenate them with your
game and minify the whole program together, so your minifier can mangle across
the boundary. A pre-minified bundle cannot be, and pins the API names at full
length.

--js13k shaders must name themselves: "export const Cube = shader({...})" emits
the global "Cube", which is what your game refers to. Nothing is derived from
the file name, so "export default" is an error.
`;

export function isShaderFile(filePath: string): boolean {
  return filePath.endsWith('.shader.ts') && !filePath.endsWith('.gen.ts');
}

export function genPathFor(shaderPath: string): string {
  return shaderPath.replace(/\.shader\.ts$/, '.shader.gen.ts');
}

export function scanShaderFiles(root: string): string[] {
  const results: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile() && isShaderFile(entry.name)) {
        results.push(path.join(dir, entry.name));
      }
    }
  };
  walk(root);
  return results.sort();
}

export interface FileCompileOptions {
  optimize: boolean;
}

export function compileFile(filePath: string, options: FileCompileOptions): void {
  const source = readFileSync(filePath, 'utf8');
  const compiled = compileShaderSource(filePath, source, options);
  for (const warning of compiled.warnings) {
    log(`⚠ ${warning}`);
  }
  const generated = buildGeneratedModule(compiled.exportName ?? shaderNameFromFile(filePath), compiled);
  writeFileSync(genPathFor(filePath), generated);
}

export interface ProjectCompileResult {
  compiled: string[];
  errors: string[];
}

export function compileProject(root: string, options: FileCompileOptions): ProjectCompileResult {
  const result: ProjectCompileResult = { compiled: [], errors: [] };
  for (const filePath of scanShaderFiles(root)) {
    const started = Date.now();
    try {
      compileFile(filePath, options);
      result.compiled.push(filePath);
      log(`✓ ${relative(root, filePath)} → ${path.basename(genPathFor(filePath))} (${Date.now() - started}ms)`);
    } catch (error) {
      result.errors.push(filePath);
      reportError(error);
    }
  }
  return result;
}

export async function runCli(argv: string[]): Promise<number> {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const command = positional[0];

  // Reject unknown flags rather than ignoring them. A flag this version does not
  // understand used to fall through to an ordinary build that exited 0 — so
  // running `--js13k` against a release that predates it quietly produced
  // .gen.ts files and failed much later, somewhere unrelated.
  const KNOWN_FLAGS = new Set(['--help', '--once', '--js13k']);
  const unknown = [...flags].filter((flag) => !KNOWN_FLAGS.has(flag));
  if (unknown.length > 0) {
    log(`Unknown flag${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}\n`);
    log(HELP);
    return 1;
  }


  if (command === undefined || flags.has('--help')) {
    log(HELP);
    return command === undefined ? 1 : 0;
  }
  if (command !== 'dev' && command !== 'prod') {
    log(`Unknown command '${command}'\n`);
    log(HELP);
    return 1;
  }

  const root = path.resolve(positional[1] ?? '.');
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    log(`✗ '${root}' is not a directory`);
    return 1;
  }

  const optimize = command === 'prod';
  if (flags.has('--js13k')) {
    return emitJs13k(root, { optimize });
  }
  const result = compileProject(root, { optimize });
  if (result.compiled.length === 0 && result.errors.length === 0) {
    log(`No *.shader.ts files found under ${root}`);
  }

  if (command === 'prod' || flags.has('--once')) {
    return result.errors.length > 0 ? 1 : 0;
  }

  log(`Watching ${root} for shader changes...`);
  const watcher = watch(root, {
    ignoreInitial: true,
    ignored: (watchedPath) => {
      const base = path.basename(watchedPath);
      return SKIP_DIRS.has(base) || (base.startsWith('.') && base !== '.');
    },
  });

  watcher.on('add', (filePath) => recompileOne(root, filePath));
  watcher.on('change', (filePath) => recompileOne(root, filePath));
  watcher.on('unlink', (filePath) => {
    if (!isShaderFile(filePath)) return;
    const genPath = genPathFor(filePath);
    if (existsSync(genPath)) {
      unlinkSync(genPath);
      log(`✗ removed ${relative(root, genPath)} (shader deleted)`);
    }
  });

  return new Promise(() => {
    /* watch mode runs until the process is interrupted */
  });
}

function recompileOne(root: string, filePath: string): void {
  if (!isShaderFile(filePath)) return;
  const started = Date.now();
  try {
    compileFile(filePath, { optimize: false });
    log(`✓ ${relative(root, filePath)} → ${path.basename(genPathFor(filePath))} (${Date.now() - started}ms)`);
  } catch (error) {
    reportError(error);
  }
}

function reportError(error: unknown): void {
  if (error instanceof CompileError) {
    log(`✗ ${error.message}`);
  } else {
    log(`✗ ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
}

function relative(root: string, filePath: string): string {
  return path.relative(root, filePath) || filePath;
}

function log(message: string): void {
  console.log(message);
}

/**
 * The js13k runtime is the compiled core with its module syntax removed — the
 * same files `full` imports, not a parallel copy. One source of truth means a
 * fix to buffer handling or an attribute format lands in both builds at once.
 *
 * Two files, concatenated in dependency order: the stateless facts, then the
 * core that uses them. They are separate modules so `full` can import the facts
 * without dragging the core's device state along with them.
 */
function js13kRuntimeParts(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.join(here, '..', 'tiny', 'gpu.js'),
    path.join(here, '..', 'tiny', 'index.js'),
  ];
}

export function emitJs13k(root: string, options: FileCompileOptions): number {
  const files = scanShaderFiles(root);
  if (files.length === 0) {
    log(`No *.shader.ts files found under ${root}`);
    return 1;
  }

  const shaders = [];
  const failed: string[] = [];
  const claimedBy = new Map<string, string>();
  for (const filePath of files) {
    try {
      const compiled = compileShaderSource(filePath, readFileSync(filePath, 'utf8'), options);
      const name = compiled.exportName;
      if (name === undefined) {
        failed.push(filePath);
        log(`✗ ${js13kNameError(relative(root, filePath))}`);
        continue;
      }
      // Every shader lands in one concatenated file, so a repeated name is not a
      // conflict the loader reports — the second const silently wins and the
      // first shader draws with the wrong pipeline.
      const owner = claimedBy.get(name);
      if (owner !== undefined) {
        failed.push(filePath);
        log(
          `✗ ${relative(root, filePath)} and ${relative(root, owner)} both export '${name}' — every shader shares one scope, so rename one`,
        );
        continue;
      }
      claimedBy.set(name, filePath);
      shaders.push(buildJs13kShader(name, compiled));
      log(`✓ ${relative(root, filePath)} → ${name}`);
    } catch (error) {
      failed.push(filePath);
      reportError(error);
    }
  }
  if (failed.length > 0) {
    return 1;
  }

  // Into the build directory, not a folder of its own. This is generated output
  // that a build wipes and rewrites, and it has no business sitting beside the
  // source it was generated from.
  const outDir = path.join(root, 'dist');
  mkdirSync(outDir, { recursive: true });

  const parts = js13kRuntimeParts();
  const missing = parts.filter((part) => !existsSync(part));
  if (missing.length > 0) {
    log(`✗ core runtime missing at ${missing.join(', ')} — run \`npm run build\``);
    return 1;
  }

  // Both files, from one command. The descriptors below are positional and the
  // runtime indexes them by number, so a runtime fetched separately could be a
  // version out and build the wrong pipeline without erroring. Emitting the
  // pair together is what makes that impossible rather than merely unlikely.
  const version = packageVersion();
  const runtime = buildJs13kRuntime(
    parts.map((part) => readFileSync(part, 'utf8')),
    version,
  );
  const file = buildJs13kShaderFile(shaders, version);
  writeFileSync(path.join(outDir, 'brometal.js'), runtime);
  writeFileSync(path.join(outDir, 'shaders.js'), file);

  const bytes = Buffer.byteLength(runtime) + Buffer.byteLength(file);
  log(
    `✓ ${relative(root, outDir)}/brometal.js + shaders.js (${shaders.length} shader${shaders.length === 1 ? '' : 's'}, ${bytes} bytes of source)`,
  );
  log(`  concatenate both with your game, then minify together`);
  return 0;
}

/**
 * The version stamped into the emitted file.
 *
 * The runtime is vendored by hand and the descriptors are positional, so the
 * two can fall out of step without anything failing loudly — an old
 * `brometal.js` reading a new array just builds the wrong pipeline. Recording
 * which compiler wrote the file is what makes that diagnosable.
 */
function packageVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
