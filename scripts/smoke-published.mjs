import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const version = process.argv[2];
if (version === undefined || !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version)) {
  console.error('Usage: node scripts/smoke-published.mjs <version>');
  process.exit(1);
}

const spec = `brometal@${version}`;
const sandbox = mkdtempSync(join(tmpdir(), 'brometal-published-'));

try {
  await waitForRegistry();
  console.log(`Installing ${spec} from npm...`);
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', spec], {
    cwd: sandbox,
    stdio: 'inherit',
  });

  const packageRoot = join(sandbox, 'node_modules', 'brometal');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  if (manifest.version !== version) {
    throw new Error(`npm installed brometal@${manifest.version}; expected ${version}`);
  }

  const brometal = await import(pathToFileURL(join(packageRoot, 'dist', 'index.js')).href);
  for (const exported of ['shader', 'createRenderer', 'createProgram', 'createTeapot', 'atomicAdd']) {
    if (!(exported in brometal)) throw new Error(`published package is missing export '${exported}'`);
  }
  const teapot = brometal.createTeapot({ segments: 2 });
  if (teapot.indices.length / 3 !== 240) {
    throw new Error(`published createTeapot() returned ${teapot.indices.length / 3} triangles; expected 240`);
  }

  const shaderPath = join(sandbox, 'smoke.shader.ts');
  writeFileSync(shaderPath, `
import { shader, vec4 } from 'brometal';
export const Smoke = shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) { return vec4(aPosition, 1); },
  fragment() { return vec4(0.2, 0.4, 0.8, 1); },
});
`);
  execFileSync('node', [join(packageRoot, 'dist', 'cli', 'index.js'), 'prod', sandbox], {
    cwd: sandbox,
    stdio: 'inherit',
  });
  const generated = readFileSync(join(sandbox, 'smoke.shader.gen.ts'), 'utf8');
  if (!generated.includes('@vertex') || !generated.includes('@fragment')) {
    throw new Error('published CLI did not generate complete WGSL entry points');
  }

  console.log(`✓ ${spec} imports, generates geometry, and compiles a shader`);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

async function waitForRegistry() {
  for (let attempt = 0; attempt < 36; attempt++) {
    try {
      const found = execFileSync('npm', ['view', spec, 'version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (found === version) return;
    } catch {
      // npm propagation is eventually consistent; retry below.
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`${spec} did not become available from npm within three minutes`);
}
