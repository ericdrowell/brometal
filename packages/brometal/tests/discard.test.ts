import { describe, expect, it } from 'vitest';

/**
 * Ported from the cut-out sprite branch, minus its GLSL assertions: WebGL2 was
 * removed from the library after that branch was written, so WGSL is the only
 * emitter left to check.
 */
import { compileShaderSource } from '../src/compiler/compile.js';

function compile(source: string) {
  return compileShaderSource('test.shader.ts', source);
}

/** A cut-out sprite shader: the whole point of `discard()`. */
const CUTOUT_SHADER = `
import { shader, discard, texture, vec4 } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uAtlas: 'sampler2D', uCutoff: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uAtlas, uCutoff }, { vUv }) {
    const texel = texture(uAtlas, vUv);
    if (texel.w < uCutoff) {
      discard();
    }
    return vec4(texel.xyz, 1);
  },
});
`;

function shaderWith(fragment: string, vertex?: string): string {
  return `
import { shader, discard, vec4 } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uCutoff: 'float' },
  varyings: { vFade: 'float' },
  vertex: ${vertex ?? `({ aPosition }, _u, v) => { v.vFade = 1; return vec4(aPosition, 1); }`},
  fragment: ${fragment},
});
`;
}

describe('discard()', () => {
  it('emits a WGSL discard inside the branch', () => {
    const wgsl = compile(CUTOUT_SHADER).wgslSrc ?? '';
    expect(wgsl).toContain('if (texel.w < bm_u.uCutoff) {');
    expect(wgsl).toContain('discard;');
  });

  it('survives a prod build with constant folding', () => {
    const folded = compileShaderSource('test.shader.ts', CUTOUT_SHADER, { optimize: true });
    expect(folded.wgslSrc).toContain('discard;');
  });

  it('keeps a varying alive when only the discard condition reads it', () => {
    // vFade is never used for colour — only to decide whether to discard. It
    // must not be pruned as a dead varying.
    const source = shaderWith(
      `(_u, { vFade }) => { if (vFade < 0.5) { discard(); } return vec4(1, 1, 1, 1); }`,
    );
    const compiled = compileShaderSource('test.shader.ts', source, { optimize: true });
    expect(compiled.wgslSrc).toContain('vFade');
    expect(compiled.wgslSrc).toContain('discard;');
    expect(Object.keys(compiled.varyings)).toContain('vFade');
  });

  it('emits discard from an else branch', () => {
    const source = shaderWith(
      `(_u, { vFade }) => { let keep = 0; if (vFade < 0.5) { keep = 1; } else { discard(); } return vec4(keep, 0, 0, 1); }`,
    );
    const glsl = compile(source).wgslSrc;
    expect(glsl).toContain('} else {');
    expect(glsl).toContain('discard;');
  });

  it('rejects discard() in the vertex stage', () => {
    const source = shaderWith(
      `(_u, { vFade }) => vec4(vFade, vFade, vFade, 1)`,
      `({ aPosition }, _u, v) => { v.vFade = 1; discard(); return vec4(aPosition, 1); }`,
    );
    expect(() => compile(source)).toThrow(/discard\(\) is only valid in fragment\(\)/);
  });

  it('rejects discard() inside a helper', () => {
    const source = `
import { shader, discard, vec4 } from 'brometal';

function cut(a: number): number {
  if (a < 0.5) {
    discard();
  }
  return a;
}

export default shader({
  attributes: { aPosition: 'vec3' },
  varyings: { vFade: 'float' },
  vertex({ aPosition }, _u, v) { v.vFade = 1; return vec4(aPosition, 1); },
  fragment(_u, { vFade }) { return vec4(cut(vFade), 0, 0, 1); },
});
`;
    expect(() => compile(source)).toThrow(/discard\(\) is only valid in fragment\(\)/);
  });

  it('rejects discard() used as a value', () => {
    const source = shaderWith(`(_u, { vFade }) => vec4(discard(), vFade, vFade, 1)`);
    expect(() => compile(source)).toThrow(/discard\(\) produces no value/);
  });

  it('rejects discard() with arguments', () => {
    const source = shaderWith(
      `(_u, { vFade }) => { if (vFade < 0.5) { discard(1); } return vec4(1, 1, 1, 1); }`,
    );
    expect(() => compile(source)).toThrow(/discard\(\) takes no arguments/);
  });

  it('allows discard() at the top level of fragment(), before the return', () => {
    const source = shaderWith(`(_u, { vFade }) => { discard(); return vec4(vFade, 0, 0, 1); }`);
    expect(compile(source).wgslSrc).toContain('discard;');
  });
});
