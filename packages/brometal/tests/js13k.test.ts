import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileShaderSource } from '../src/compiler/compile.js';
import { buildJs13kShader, buildJs13kShaderFile, js13kNameError } from '../src/js13k/emit.js';
import { buildGeneratedModule } from '../src/compiler/emit-module.js';

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

/** Writes its state, so the buffer binds read_write and hides from vertex. */
const SIMULATE = `
import { shader, vec4, storageRead, storageWrite } from 'brometal';
export const Simulate = shader({
  uniforms: { uDt: 'float' },
  storage: { uState: 'vec4' },
  workgroupSize: [1, 1, 1],
  compute({ uState, uDt }, id) {
    const prev = storageRead(uState, id.x);
    storageWrite(uState, id.x, vec4(prev.x + prev.z * uDt, prev.y, prev.z, prev.w));
  },
});
`;

/** Only reads it, so the same buffer stays visible to its vertex stage. */
const FOLLOW = `
import { shader, vec4, vec3, storageRead } from 'brometal';
export const Follow = shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uMvp: 'mat4' },
  storage: { uState: 'vec4' },
  varyings: { vShade: 'float' },
  vertex({ aPosition }, { uMvp, uState }, v) {
    const body = storageRead(uState, 0);
    v.vShade = body.y;
    return uMvp.mul(vec4(aPosition.add(vec3(body.x, body.y, body.z)), 1));
  },
  fragment({}, { vShade }) {
    return vec4(vShade, vShade, vShade, 1);
  },
});
`;

describe('js13k compute descriptor', () => {
  const sim = compileShaderSource('s.shader.ts', SIMULATE);
  const emitted = buildJs13kShader('Simulate', sim).source;
  const value = JSON.parse(emitted.slice(emitted.indexOf('['), emitted.lastIndexOf(']') + 1)) as [
    string, number[], number[], number, number[][], number[][],
  ];

  it('emits a cs_main entry point the tiny runtime can build a pipeline from', () => {
    // The compiler has always been able to emit this; --js13k used to drop it
    // on the floor, so the shader compiled and there was no way to run it.
    expect(sim.hasCompute).toBe(true);
    expect(value[0]).toContain('@compute');
    expect(value[0]).toContain('fn cs_main');
  });

  it('marks a written storage buffer, so it binds read_write', () => {
    // [binding, written]. The bit decides both the WGSL access mode and which
    // stages may see the binding, and only the compiler knows it — without it
    // the runtime would have to guess, and guessing 'storage' for a read-only
    // buffer makes it invisible to the vertex stage for no reason.
    expect(sim.storageWritten).toContain('uState');
    expect(value[5]).toEqual([[1, 1]]);
  });

  it('leaves a buffer it only reads unmarked, so a vertex stage can see it', () => {
    // The whole seam: one GPUBuffer, written by the compute program, read by
    // the draw program. WebGPU forbids a read_write binding in a vertex stage,
    // so this side has to come out read-only or the pipeline is rejected.
    const follow = compileShaderSource('f.shader.ts', FOLLOW);
    const source = follow && buildJs13kShader('Follow', follow).source;
    const descriptor = JSON.parse(source.slice(source.indexOf('['), source.lastIndexOf(']') + 1)) as [
      string, number[], number[], number, number[][], number[][],
    ];
    expect(follow.storageWritten).toBeUndefined();
    expect(descriptor[5][0][1]).toBe(0);
  });

  it('names the buffers in bmStorages order', () => {
    // Positional arguments with nothing at the call site to say which is which.
    expect(emitted).toContain('// bmStorages order: uState (written)');
  });

  it('omits the storage slot entirely when a shader has none', () => {
    // The array is positional and ships in the zip, so a trailing [] on every
    // shader that never computes is pure cost. Existing indices are unmoved.
    const plain = compileShaderSource('t.shader.ts', TEXTURED);
    const source = buildJs13kShader('Textured', plain).source;
    const descriptor = JSON.parse(source.slice(source.indexOf('['), source.lastIndexOf(']') + 1));
    expect(descriptor).toHaveLength(5);
  });
});

describe('tiny runtime compute surface', () => {
  it('offers a compute pipeline, storage buffers and dispatch', () => {
    for (const fn of ['bmCompute', 'bmStore', 'bmStorages', 'bmDispatch']) {
      expect(CODE).toContain(`function ${fn}(`);
    }
    expect(CODE).toContain('createComputePipeline');
    expect(CODE).toContain('dispatchWorkgroups');
  });

  it('uses the storage usage bits and the visibility masks WebGPU requires', () => {
    // COPY_DST|STORAGE = 136. The visibility pair is the one that fails without
    // an error you can act on: a read_write binding visible to VERTEX makes the
    // whole bind group layout invalid, and the message names the submit.
    expect(CODE).toMatch(/BUF_STORAGE\s*=\s*136/);
    expect(CODE).toMatch(/VIS_STORAGE_RW\s*=\s*6/);
    expect(CODE).toMatch(/VIS_STORAGE_RO\s*=\s*7/);
    expect(CODE).toMatch(/written \? VIS_STORAGE_RW : VIS_STORAGE_RO/);
  });

  it('lets a vertex stage sample a texture', () => {
    // Bound FRAGMENT-only before compute existed here, which rejected a vertex
    // texture fetch at pipeline creation while the full runtime allowed it.
    // Asserted as "textures take the pipeline's own mask" rather than a literal,
    // since that is the property that has to hold for both pipeline kinds.
    expect(CODE).toContain('{ binding: tex, visibility: vis, texture: {} }');
    expect(CODE).not.toMatch(/binding: tex, visibility: 2/);
  });

  it('binds a compute program to the compute stage, not the render stages', () => {
    // visibility 3 is VERTEX|FRAGMENT; a compute pipeline has neither, and a
    // mask naming a stage the pipeline lacks invalidates the layout.
    expect(CODE).toMatch(/VIS_RENDER\s*=\s*3/);
    expect(CODE).toMatch(/VIS_COMPUTE\s*=\s*4/);
    expect(CODE).toContain('bmLayout(VIS_COMPUTE');
    expect(CODE).toContain('bmLayout(VIS_RENDER');
  });
});

describe('js13k shader descriptor', () => {
  const compiled = compileShaderSource('t.shader.ts', TEXTURED);
  const emitted = buildJs13kShader('Textured', compiled).source;
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

  it('explains how to name a shader rather than inventing one', () => {
    const message = js13kNameError('src/cube.shader.ts');
    expect(message).toContain('src/cube.shader.ts');
    expect(message).toContain('export const Cube = shader({...})');
  });

  it('emits one file the game can concatenate', () => {
    const file = buildJs13kShaderFile([buildJs13kShader('Alpha', compiled)]);
    expect(file).toContain('const Alpha = [');
    expect(file).toContain('terser --toplevel --mangle');
  });
});

describe('shader names declared in code', () => {
  const named = (name: string): string =>
    TEXTURED.replace('export default shader({', `export const ${name} = shader({`);

  it('reads the name from an exported const', () => {
    expect(compileShaderSource('src/anything.shader.ts', named('Cube')).exportName).toBe('Cube');
  });

  it('leaves export default unnamed, which is what --js13k rejects', () => {
    expect(compileShaderSource('src/cube.shader.ts', TEXTURED).exportName).toBeUndefined();
  });

  it('ignores a const that is not exported', () => {
    // `const s = shader({...}); export default s` must not pick up `s` — a
    // throwaway local is not a name anyone meant to publish, and under --js13k
    // it would become the global the game has to type. The export modifier is
    // what opts in.
    const source = `${TEXTURED.replace('export default shader({', 'const s = shader({')}\nexport default s;\n`;
    expect(compileShaderSource('src/cube.shader.ts', source).exportName).toBeUndefined();
  });

  it('emits the declared name verbatim, with nothing added or reshaped', () => {
    const compiled = compileShaderSource('src/anything.shader.ts', named('ColorCube'));
    const emitted = buildJs13kShader(compiled.exportName!, compiled).source;
    expect(emitted).toContain('const ColorCube = [');
    // The whole point: no prefix, no case change, nothing to translate.
    expect(emitted).not.toContain('BM_');
    expect(emitted).not.toContain('COLOR_CUBE');
  });

  it('names the generated module after the declared name', () => {
    const compiled = compileShaderSource('src/anything.shader.ts', named('Cube'));
    const module = buildGeneratedModule(compiled.exportName ?? 'fallbackShader', compiled);
    expect(module).toContain('const Cube:');
    expect(module).toContain('export default Cube;');
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
    // available here. `npm run test:template` gates the real number — ~2.4 KB
    // gzipped against a 3 KB budget.
    //
    // Raised from 16000 when compute landed. That is the ceiling doing its job
    // rather than failing at it: the jump was a new capability — compute
    // pipelines, storage buffers, dispatch — and the number was re-set once the
    // growth had been looked at and the prose trimmed, not nudged to fit.
    //
    // Source length is not what a game pays. Comments never reach the zip, and
    // a game that only draws pays about 100 bytes of it, for the storage
    // bindings bmProgram must accept to read what compute produced. Judge a
    // change against test:template; judge it against this one for scope creep.
    expect(RUNTIME.length).toBeLessThan(22000);
  });

  it('carries nothing only the full runtime needs', () => {
    // tiny is shared now, which makes it tempting to grow it to serve `full`.
    // These are the features that belong on the other side of that line.
    //
    // `dispatch(` used to be on this list and is deliberately off it: compute
    // is a tiny feature now. It had stopped testing anything anyway — bmDispatch
    // and dispatchWorkgroups both miss the lowercase-then-paren pattern, so the
    // assertion would have passed unchanged while the feature landed.
    //
    // `storageWritten` stays: the *flag* belongs here, but resolving a name to
    // it is the compiler's job, and the descriptor arrives with the bit already
    // decided rather than the buffer's name for tiny to look up.
    for (const full of ['createRenderTarget', 'storageWritten', 'resolveTarget']) {
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
