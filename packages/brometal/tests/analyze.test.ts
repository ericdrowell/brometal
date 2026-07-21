import { describe, expect, it } from 'vitest';
import { compileShaderSource } from '../src/compiler/compile.js';
import { CompileError } from '../src/compiler/errors.js';

function compile(source: string) {
  return compileShaderSource('test.shader.ts', source);
}

function minimalShader(overrides: { vertex?: string; fragment?: string; interface?: string }): string {
  return `
import { shader, vec4 } from 'brometal';
export default shader({
  ${overrides.interface ?? `attributes: { aPosition: 'vec3' }, varyings: { vFade: 'float' }`},
  vertex: ${overrides.vertex ?? `({ aPosition }, _u, v) => { v.vFade = 1; return vec4(aPosition, 1); }`},
  fragment: ${overrides.fragment ?? `(_u, { vFade }) => vec4(vFade, vFade, vFade, 1)`},
});
`;
}

describe('shader validation', () => {
  it('rejects unknown GPU type strings', () => {
    expect(() => compile(minimalShader({ interface: `attributes: { aPosition: 'vec5' }` }))).toThrow(
      /'vec5' is not a valid GPU type/,
    );
  });

  it('rejects mat4 attributes', () => {
    expect(() => compile(minimalShader({ interface: `attributes: { aModel: 'mat4' }` }))).toThrow(
      /'mat4' is only supported for uniforms/,
    );
  });

  it('rejects duplicate names across the interface', () => {
    expect(() =>
      compile(
        minimalShader({
          interface: `attributes: { aFoo: 'vec3' }, uniforms: { aFoo: 'float' }, varyings: { vFade: 'float' }`,
        }),
      ),
    ).toThrow(/declared in both attributes and uniforms/);
  });

  it('requires vertex to assign every varying', () => {
    expect(() =>
      compile(minimalShader({ vertex: `({ aPosition }) => vec4(aPosition, 1)` })),
    ).toThrow(/must assign every declared varying.*vFade/);
  });

  it('rejects reading a varying that is not declared', () => {
    expect(() =>
      compile(minimalShader({ fragment: `(_u, { vBogus }) => vec4(vBogus, 0, 0, 1)` })),
    ).toThrow(/'vBogus' is not declared in varyings/);
  });

  it('rejects varying writes in fragment', () => {
    expect(() =>
      compile(
        minimalShader({
          fragment: `(_u, v) => { v.vFade = 1; return vec4(1, 1, 1, 1); }`,
        }),
      ),
    ).toThrow(/read-only in fragment/);
  });

  it('rejects reading a varying before it is assigned in vertex', () => {
    expect(() =>
      compile(
        minimalShader({
          vertex: `({ aPosition }, _u, v) => { const x = v.vFade; v.vFade = x; return vec4(aPosition, 1); }`,
        }),
      ),
    ).toThrow(/read before it is assigned/);
  });

  it('rejects attribute access in fragment', () => {
    expect(() =>
      compile(
        minimalShader({
          fragment: `({ aPosition }) => vec4(aPosition, 1)`,
        }),
      ),
    ).toThrow(/'aPosition' is not declared in uniforms/);
  });

  it('rejects unsupported statements with a clear message', () => {
    expect(() =>
      compile(
        minimalShader({
          vertex: `({ aPosition }, _u, v) => { v.vFade = 1; while (1 < 2) {} return vec4(aPosition, 1); }`,
        }),
      ),
    ).toThrow(/WhileStatement is not supported/);
  });

  it('rejects let declarations', () => {
    expect(() =>
      compile(
        minimalShader({
          vertex: `({ aPosition }, _u, v) => { let x = 1; v.vFade = x; return vec4(aPosition, 1); }`,
        }),
      ),
    ).toThrow(/only `const` declarations/);
  });

  it('rejects return inside if branches', () => {
    expect(() =>
      compile(
        minimalShader({
          vertex: `({ aPosition }, _u, v) => { v.vFade = 1; if (aPosition.x < 0) { return vec4(aPosition, 1); } return vec4(aPosition, 1); }`,
        }),
      ),
    ).toThrow(/return must be the final top-level statement/);
  });

  it('requires a vec4 return value', () => {
    expect(() =>
      compile(
        minimalShader({
          fragment: `(_u, { vFade }) => vec4(vFade, vFade, vFade, 1).xyz`,
        }),
      ),
    ).toThrow(/fragment\(\) must return a vec4/);
  });

  it('rejects unknown functions and names the supported ones', () => {
    expect(() =>
      compile(
        minimalShader({
          vertex: `({ aPosition }, _u, v) => { v.vFade = myHelper(1); return vec4(aPosition, 1); }`,
        }),
      ),
    ).toThrow(/unknown function 'myHelper'/);
  });

  it('rejects vector arithmetic via operators with guidance', () => {
    expect(() =>
      compile(
        minimalShader({
          interface: `attributes: { aPosition: 'vec3', aOffset: 'vec3' }, varyings: { vFade: 'float' }`,
          vertex: `({ aPosition, aOffset }, _u, v) => { v.vFade = 1; return vec4(aPosition + aOffset, 1); }`,
        }),
      ),
    ).toThrow(/use vector methods/);
  });

  it('rejects wrong vec constructor arity', () => {
    expect(() =>
      compile(
        minimalShader({
          vertex: `({ aPosition }, _u, v) => { v.vFade = 1; return vec4(aPosition, 1, 1); }`,
        }),
      ),
    ).toThrow(/vec4\(\) needs exactly 4 components, got 5/);
  });

  it('rejects out-of-range swizzles', () => {
    expect(() =>
      compile(
        minimalShader({
          interface: `attributes: { aPosition: 'vec2' }, varyings: { vFade: 'float' }`,
          vertex: `({ aPosition }, _u, v) => { v.vFade = aPosition.z; return vec4(aPosition, 0, 1); }`,
        }),
      ),
    ).toThrow(/component 'z' is out of range for vec2/);
  });

  it('rejects locals that shadow interface names', () => {
    expect(() =>
      compile(
        minimalShader({
          vertex: `({ aPosition }, _u, v) => { const vFade = 1; v.vFade = vFade; return vec4(aPosition, 1); }`,
        }),
      ),
    ).toThrow(/shadows a declared attribute\/uniform\/varying/);
  });

  it('rejects instance attributes that collide with attributes', () => {
    expect(() =>
      compile(
        minimalShader({
          interface: `attributes: { aPosition: 'vec3' }, instanceAttributes: { aPosition: 'vec3' }, varyings: { vFade: 'float' }`,
        }),
      ),
    ).toThrow(/declared in both attributes and instanceAttributes/);
  });

  it('rejects mat4 instance attributes', () => {
    expect(() =>
      compile(
        minimalShader({
          interface: `attributes: { aPosition: 'vec3' }, instanceAttributes: { iModel: 'mat4' }, varyings: { vFade: 'float' }`,
        }),
      ),
    ).toThrow(/'mat4' is only supported for uniforms/);
  });

  it('rejects instance attribute access in fragment', () => {
    expect(() =>
      compile(
        minimalShader({
          interface: `attributes: { aPosition: 'vec3' }, instanceAttributes: { iOffset: 'vec3' }, varyings: { vFade: 'float' }`,
          vertex: `({ aPosition, iOffset }, _u, v) => { v.vFade = 1; return vec4(aPosition.add(iOffset), 1); }`,
          fragment: `(_u, { iOffset }) => vec4(iOffset, 1)`,
        }),
      ),
    ).toThrow(/'iOffset' is not declared in varyings/);
  });

  it('names both records when a vertex input is unknown', () => {
    expect(() =>
      compile(
        minimalShader({
          vertex: `({ aBogus }, _u, v) => { v.vFade = 1; return vec4(aBogus, 1); }`,
        }),
      ),
    ).toThrow(/'aBogus' is not declared in attributes or instanceAttributes/);
  });

  it('rejects modules without a shader import', () => {
    expect(() => compile(`export default 1;`)).toThrow(/no `shader` import found/);
  });

  it('reports file, line, and column in diagnostics', () => {
    try {
      compile(minimalShader({ interface: `attributes: { aPosition: 'vec5' }` }));
      expect.unreachable('expected a CompileError');
    } catch (error) {
      expect(error).toBeInstanceOf(CompileError);
      const diagnostic = (error as CompileError).diagnostic;
      expect(diagnostic.file).toBe('test.shader.ts');
      expect(diagnostic.line).toBeGreaterThan(1);
      expect(diagnostic.column).toBeGreaterThan(0);
    }
  });
});
