import { watch } from 'chokidar';
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { compileShaderSource } from '../compiler/compile.js';
import { buildGeneratedModule, shaderNameFromFile } from '../compiler/emit-module.js';
import { CompileError } from '../compiler/errors.js';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git']);

const HELP = `BroMetal — compile TypeScript shaders to GLSL

Usage:
  brometal dev [dir]    Compile all *.shader.ts files and watch for changes
  brometal dev --once   Compile once without watching (readable output)
  brometal prod [dir]   Compile once with optimizations (folding + minified GLSL)

Each src/**/name.shader.ts compiles to a sibling name.shader.gen.ts that your
app imports and passes to createProgram().
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

export function compileFile(filePath: string, options: { optimize: boolean }): void {
  const source = readFileSync(filePath, 'utf8');
  const compiled = compileShaderSource(filePath, source, options);
  const generated = buildGeneratedModule(shaderNameFromFile(filePath), compiled);
  writeFileSync(genPathFor(filePath), generated);
}

export interface ProjectCompileResult {
  compiled: string[];
  errors: string[];
}

export function compileProject(root: string, options: { optimize: boolean }): ProjectCompileResult {
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
