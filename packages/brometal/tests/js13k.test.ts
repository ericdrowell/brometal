import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileShaderSource } from '../src/compiler/compile.js';
import { buildJs13kShader, buildJs13kShaderFile, js13kNameFromFile } from '../src/js13k/emit.js';

// The core is now shared with `full`, so these invariants guard both builds.
// Both files, because --js13k concatenates them and the facts they assert about
// live in gpu.ts while the draw path lives in index.ts.
const RUNTIME = ['../src/tiny/gpu.ts', '../src/tiny/index.ts']
  .map((f) => readFileSync(new URL(f, import.meta.url), 'utf8'))
  .join('\n');
/**
 * Code only — both line and block comments removed. The prose here names the
 * exact mistakes these tests assert are absent ("not float32x1"), so scanning
 * comments makes a passing implementation look like a failing one.
 */
const CODE = RUNTIME.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const TEXTURED = `
import { shader, vec4, texture } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  instanceAttributes: { iOffset: 'vec3', iScale: 'float' },
  uniforms: { uMvp: 'mat4', uTex: 'sampler2D' },
  varyings: { vUv: 'vec2' },
  vertex({ aPosition, aUv, iOffset, iScale }, { uMvp }, v) {
    v.vUv = aUv;
    return uMvp.mul(vec4(aPosition.scale(iScale).add(iOffset), 1));
  },
  fragment({ uTex }, { vUv }) {
    return texture(uTex, vUv);
  },
});
`;

describe('js13k shader descriptor', () => {
  const compiled = compileShaderSource('t.shader.ts', TEXTURED);
  const emitted = buildJs13kShader('BM_T', compiled).source;
  const value = JSON.parse(emitted.slice(emitted.indexOf('['), emitted.lastIndexOf(']') + 1)) as [
    string,
    number[],
    number[],
    number,
    number[][],
  ];

  it('is positional, with no keys to pay for', () => {
    // Names are the expensive part of the normal .gen module and none of them
    // survive here — the runtime indexes this array.
    expect(value).toHaveLength(5);
    expect(emitted).not.toContain('"name"');
  });

  it('separates per-vertex from per-instance attributes', () => {
    expect(value[1]).toEqual([3, 2]);
    expect(value[2]).toEqual([3, 1]);
  });

  it('carries the uniform block size and the sampler bindings', () => {
    expect(value[3]).toBe(compiled.layout.uniformBlockSize);
    // Texture and sampler travel as a pair, at the indices the compiler chose —
    // the runtime builds its bind group layout from exactly these.
    expect(value[4]).toEqual([[1, 2]]);
  });

  it('records uniform offsets as a comment, which costs nothing at runtime', () => {
    expect(emitted).toMatch(/\/\/ uniform floats: uMvp @0\.\.15/);
  });

  it('derives a global name from the file name', () => {
    expect(js13kNameFromFile('src/color-cube.shader.ts')).toBe('BM_COLOR_CUBE');
    expect(js13kNameFromFile('/a/b/game-glow.shader.ts')).toBe('BM_GAME_GLOW');
  });

  it('emits one file the game can concatenate', () => {
    const file = buildJs13kShaderFile([buildJs13kShader('BM_A', compiled)]);
    expect(file).toContain('const BM_A = [');
    expect(file).toContain('terser --toplevel --mangle');
  });
});

describe('tiny runtime', () => {
  it('ships no diagnostics', () => {
    // The whole point of this build is that guards are bytes spent on the game
    // instead. If a throw or a console call appears, the budget is leaking.
    expect(CODE).not.toMatch(/\bthrow\b/);
    expect(CODE).not.toMatch(/console\./);
  });

  it('stays within its source budget', () => {
    // A ceiling on source rather than on minified output: this file is emitted
    // as source and minified by the consumer, so source growth is the signal
    // available here. `npm run test:template` gates the real number — ~2 KB
    // gzipped against a 3 KB budget.
    expect(RUNTIME.length).toBeLessThan(16000);
  });

  it('carries nothing only the full runtime needs', () => {
    // tiny is shared now, which makes it tempting to grow it to serve `full`.
    // These are the features that belong on the other side of that line.
    for (const full of ['createRenderTarget', 'dispatch(', 'storageWritten', 'resolveTarget']) {
      expect(CODE).not.toContain(full);
    }
  });

  it('uses the buffer usage bits WebGPU actually requires', () => {
    // COPY_DST|INDEX = 24 and COPY_DST|VERTEX = 40. Getting these wrong fails
    // silently — no exception, just a canvas that never draws — which is
    // exactly how it shipped broken the first time.
    expect(CODE).toMatch(/BUF_INDEX\s*=\s*24/);
    expect(CODE).toMatch(/BUF_VERTEX\s*=\s*40/);
  });

  it('spells a one-component attribute as float32', () => {
    // 'float32x1' is not a WebGPU format and rejects the entire pipeline, so a
    // shader with a scalar instance attribute draws nothing at all.
    //
    // Asserted as intent rather than exact source: the first version of this
    // pinned the literal expression and broke the moment the helper was
    // retyped, which tests nothing useful.
    expect(CODE).not.toContain('float32x1');
    expect(CODE).toMatch(/n > 1[^\n]*float32/);
  });
});
