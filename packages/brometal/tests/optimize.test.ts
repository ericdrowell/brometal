import { describe, expect, it } from 'vitest';
import { compileShaderSource } from '../src/compiler/compile.js';
import { minifyGlsl } from '../src/compiler/optimize.js';
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
    expect(compiled.vertexSrc).toContain('aWeight*10.0');
    expect(compiled.vertexSrc).toContain('-2.0');
    expect(compiled.vertexSrc).toContain('0.5');
  });

  it('leaves non-constant expressions intact without optimize', () => {
    const compiled = compileShaderSource('test.shader.ts', FOLDING_SHADER);
    expect(compiled.vertexSrc).toContain('aWeight * (2.0 * 3.0 + 4.0)');
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
    expect(compiled.vertexSrc).toContain('1.0/0.0');
  });

  it('minifies GLSL while keeping directives on their own lines', () => {
    const compiled = compileShaderSource('test.shader.ts', CUBE_SHADER, { optimize: true });
    const [firstLine, ...rest] = compiled.vertexSrc.trimEnd().split('\n');
    expect(firstLine).toBe('#version 300 es');
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain('void main(){');
    expect(compiled.fragmentSrc).toContain('#version 300 es\nprecision highp float;');
  });

  it('minification preserves spaces around plus and minus', () => {
    const minified = minifyGlsl('void main() {\n  float x = a - -1.0;\n}\n');
    expect(minified).toContain('x=a - -1.0');
  });

  it('minified cube shader still contains its declarations', () => {
    const compiled = compileShaderSource('test.shader.ts', CUBE_SHADER, { optimize: true });
    expect(compiled.vertexSrc).toContain('in vec3 aPosition;');
    expect(compiled.vertexSrc).toContain('uniform mat4 uMvp;');
    expect(compiled.vertexSrc).toContain('gl_Position=uMvp*vec4(aPosition,1.0);');
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
    expect(dev.vertexSrc).toContain('vUnused');
    expect(dev.warnings).toEqual([
      `test.shader.ts — varying 'vUnused' is never read — it will be removed from prod builds`,
    ]);

    const prod = compileShaderSource('test.shader.ts', source, { optimize: true });
    expect(prod.vertexSrc).not.toContain('vUnused');
    expect(prod.fragmentSrc).not.toContain('vUnused');
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
