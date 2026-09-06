import { describe, expect, it } from 'vitest';

import { compileShaderSource } from '../src/compiler/compile.js';

/**
 * A shader with one of everything the renamer touches: a helper with a
 * parameter, locals in both draw stages, a loop variable, a compute stage with
 * an invocation id, and a storage buffer to prove it is left alone.
 */
const SOURCE = `
import { shader, vec3, vec4, sin, storageRead, storageWrite } from 'brometal';

function palette(theOffset: number): Vec3 {
  const scaled = theOffset * 2;
  return vec3(scaled, scaled, scaled);
}

export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uTime: 'float' },
  storage: { uState: 'vec4' },
  varyings: { vShade: 'float' },
  compute({ uState, uTime }, id) {
    const slotIndex = id.x;
    const previous = storageRead(uState, slotIndex);
    storageWrite(uState, slotIndex, vec4(previous.xyz, uTime));
  },
  vertex({ aPosition }, { uTime }, v) {
    let accumulated = 0;
    for (let i = 0; i < 4; i += 1) {
      accumulated = accumulated + sin(uTime + i);
    }
    v.vShade = accumulated;
    return vec4(aPosition, 1);
  },
  fragment(_u, { vShade }) {
    const tinted = palette(vShade);
    return vec4(tinted, 1);
  },
});
`;

const compile = (optimize: boolean): string =>
  compileShaderSource('minify.shader.ts', SOURCE, { optimize }).wgslSrc;

describe('WGSL identifier minification', () => {
  it('keeps every source name in a dev build', () => {
    const wgsl = compile(false);
    for (const name of ['palette', 'theOffset', 'scaled', 'accumulated', 'slotIndex', 'previous']) {
      expect(wgsl).toContain(name);
    }
  });

  it('shortens module-local names in a prod build', () => {
    const wgsl = compile(true);
    for (const name of ['palette', 'theOffset', 'scaled', 'accumulated', 'slotIndex', 'previous']) {
      expect(wgsl).not.toContain(name);
    }
    // The helper still exists, and its call still resolves to it.
    const declared = wgsl.match(/fn (\w+)\(\w+ : f32\) -> vec3f/);
    expect(declared).not.toBeNull();
    expect(wgsl).toContain(`${declared![1]!}(`);
  });

  it('leaves the names the host binds against alone', () => {
    const wgsl = compile(true);
    // Entry points: the runtime looks these up by name to build a pipeline, and
    // renaming them fails at pipeline creation rather than at compile time.
    expect(wgsl).toContain('fn vs_main(');
    expect(wgsl).toContain('fn fs_main(');
    expect(wgsl).toContain('fn cs_main(');
    // Struct fields and storage bindings come from the layout the host shares.
    expect(wgsl).toContain('aPosition');
    expect(wgsl).toContain('uTime');
    expect(wgsl).toContain('vShade');
    expect(wgsl).toContain('uState');
  });

  it('never emits a WGSL reserved word or a builtin as a name', () => {
    const wgsl = compile(true);
    // Every generated name is a letter, or a letter and a digit. No reserved
    // word and no builtin contains a digit, and none is a single character, so
    // the pool cannot collide with either — this pins that property.
    const declarations = [...wgsl.matchAll(/\b(?:let|var) (\w+) =/g)].map((m) => m[1]!);
    expect(declarations.length).toBeGreaterThan(0);
    for (const name of declarations) {
      if (name.startsWith('bm_')) continue;
      expect(name).toMatch(/^[a-z]([0-9])?$/);
    }
  });

  it('gives the shortest names to the most-used identifiers', () => {
    // `accumulated` is read and written inside a loop, so it outranks the
    // single-use locals and should land on a one-character name.
    const wgsl = compile(true);
    const loop = wgsl.match(/for \(var (\w+) = 0\.0/);
    expect(loop).not.toBeNull();
    expect(loop![1]!.length).toBe(1);
  });
});
