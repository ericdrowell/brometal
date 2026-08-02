import { describe, expect, it } from 'vitest';
import { compileShaderSource } from '../src/compiler/compile.js';
import { CUBE_SHADER } from './fixtures.js';

const FOLDING_SHADER = `
import { shader, vec4 } from 'brometal';
export default shader({
  attributes: { aWeight: 'float' },
  vertex({ aWeight }) {
    const scaled = aWeight * (2 * 3 + 4);
    const offset = -(1 + 1);
    return vec4(scaled, offset, 1 / 2, 1);
  },
  fragment() {
    return vec4(1, 1, 1, 1);
  },
});
`;

describe('prod optimizations', () => {
  it('folds constant float expressions', () => {
    const compiled = compileShaderSource('test.shader.ts', FOLDING_SHADER, { optimize: true });
    expect(compiled.wgslSrc).toContain('bm_in.aWeight * 10.0');
    expect(compiled.wgslSrc).toContain('-2.0');
    expect(compiled.wgslSrc).toContain('0.5');
  });

  it('leaves non-constant expressions intact without optimize', () => {
    const compiled = compileShaderSource('test.shader.ts', FOLDING_SHADER);
    expect(compiled.wgslSrc).toContain('bm_in.aWeight * (2.0 * 3.0 + 4.0)');
  });

  it('does not fold division by zero', () => {
    const source = `
import { shader, vec4 } from 'brometal';
export default shader({
  attributes: { aWeight: 'float' },
  vertex({ aWeight }) {
    return vec4(aWeight, 1 / 0, 0, 1);
  },
  fragment() {
    return vec4(1, 1, 1, 1);
  },
});
`;
    const compiled = compileShaderSource('test.shader.ts', source, { optimize: true });
    expect(compiled.wgslSrc).toContain('1.0 / 0.0');
  });




  it('removes never-read varyings and their assignments in prod builds', () => {
    const source = `
import { shader, vec4 } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3', aColor: 'vec3' },
  varyings: { vColor: 'vec3', vUnused: 'vec3' },
  vertex({ aPosition, aColor }, _u, v) {
    v.vColor = aColor;
    v.vUnused = aColor;
    return vec4(aPosition, 1);
  },
  fragment(_u, { vColor }) {
    return vec4(vColor, 1);
  },
});
`;
    const dev = compileShaderSource('test.shader.ts', source);
    expect(dev.wgslSrc).toContain('vUnused');
    expect(dev.warnings).toEqual([
      `test.shader.ts — varying 'vUnused' is never read — it will be removed from prod builds`,
    ]);

    const prod = compileShaderSource('test.shader.ts', source, { optimize: true });
    expect(prod.wgslSrc).not.toContain('vUnused');
    expect(prod.wgslSrc).toContain('vColor');
  });

  it('warns about unused attributes, instance attributes, and uniforms', () => {
    const source = `
import { shader, vec4 } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3', aDead: 'float' },
  instanceAttributes: { iDead: 'vec2' },
  uniforms: { uDead: 'mat4' },
  vertex({ aPosition }) {
    return vec4(aPosition, 1);
  },
  fragment() {
    return vec4(1, 1, 1, 1);
  },
});
`;
    const { warnings } = compileShaderSource('test.shader.ts', source);
    expect(warnings).toEqual([
      `test.shader.ts — attribute 'aDead' is declared but never used`,
      `test.shader.ts — instance attribute 'iDead' is declared but never used`,
      `test.shader.ts — uniform 'uDead' is declared but never used`,
    ]);
  });

  it('emits no warnings for fully used shaders', () => {
    expect(compileShaderSource('test.shader.ts', CUBE_SHADER).warnings).toEqual([]);
  });
});
