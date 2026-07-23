import { describe, expect, it } from 'vitest';
import { compileShaderSource } from '../src/compiler/compile.js';
import { SHADER_LIBRARY_NAMES } from '../src/shader-functions/library-source.js';

function compile(source: string) {
  return compileShaderSource('test.shader.ts', source);
}

function importOnlyShader(name: string): string {
  return `
import { shader, vec4 } from 'brometal';
import { ${name} } from 'brometal/shader-functions';
export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) { return vec4(aPosition, 1); },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
}

describe('brometal/shaders library', () => {
  // Importing a function compiles its full source through analysis and both
  // emitters even when unused — a per-function DSL-compliance gate.
  it.each(SHADER_LIBRARY_NAMES)('%s compiles under both backends', (name) => {
    const compiled = compile(importOnlyShader(name));
    // Unused-import warnings (for the function and its deps) are the only
    // acceptable diagnostics; anything else is a library-source defect.
    expect(compiled.warnings.length).toBeGreaterThan(0);
    for (const warning of compiled.warnings) {
      expect(warning).toMatch(/is declared but never called$/);
    }
  });

  it('inlines an imported function and its transitive deps in dependency order', () => {
    const source = `
import { shader, vec3, vec4 } from 'brometal';
import { fbm2 } from 'brometal/shader-functions';
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float' },
  varyings: { vUv: 'vec2' },
  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },
  fragment({ uTime }, { vUv }) {
    const n = fbm2(vUv.scale(4).add(vec2(uTime, 0)), 5);
    return vec4(vec3(n, n, n), 1);
  },
});
`.replace('vec2(uTime, 0)', 'vec2(uTime, 0)');
    const withImports = source.replace(
      "import { shader, vec3, vec4 } from 'brometal';",
      "import { shader, vec2, vec3, vec4 } from 'brometal';",
    );
    const compiled = compile(withImports);
    const glsl = compiled.fragmentSrc;
    const hashIndex = glsl.indexOf('float hash21(vec2 p) {');
    const noiseIndex = glsl.indexOf('float vnoise2(vec2 p) {');
    const fbmIndex = glsl.indexOf('float fbm2(vec2 p, float octaves) {');
    expect(hashIndex).toBeGreaterThan(-1);
    expect(noiseIndex).toBeGreaterThan(hashIndex);
    expect(fbmIndex).toBeGreaterThan(noiseIndex);
    expect(glsl).toContain('fbm2(vUv * 4.0 + vec2(uTime, 0.0), 5.0)');

    const wgsl = compiled.wgslSrc!;
    expect(wgsl).toContain('fn hash21(p : vec2f) -> f32 {');
    expect(wgsl).toContain('fn fbm2(p : vec2f, octaves : f32) -> f32 {');
  });

  it('only emits imported functions into stages that use them', () => {
    const source = `
import { shader, vec4 } from 'brometal';
import { sdCircle, fillAA } from 'brometal/shader-functions';
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  varyings: { vUv: 'vec2' },
  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },
  fragment(_u, { vUv }) {
    const d = sdCircle(vUv.sub(vec2(0.5, 0.5)), 0.25);
    const a = fillAA(d, 0.01);
    return vec4(a, a, a, 1);
  },
});
`.replace(
      "import { shader, vec4 } from 'brometal';",
      "import { shader, vec2, vec4 } from 'brometal';",
    );
    const compiled = compile(source);
    expect(compiled.vertexSrc).not.toContain('sdCircle');
    expect(compiled.fragmentSrc).toContain('float sdCircle(vec2 p, float radius) {');
    expect(compiled.fragmentSrc).toContain('float fillAA(float d, float softness) {');
  });

  it('lets user helpers call library functions', () => {
    const source = `
import { shader, vec3, vec4, type Vec2, type Vec3 } from 'brometal';
import { vnoise2 } from 'brometal/shader-functions';

function turbulence(p: Vec2): number {
  return abs(vnoise2(p) * 2 - 1);
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  varyings: { vUv: 'vec2' },
  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },
  fragment(_u, { vUv }) {
    const t = turbulence(vUv.scale(6));
    return vec4(vec3(t, t, t), 1);
  },
});
`;
    const compiled = compile(source);
    expect(compiled.warnings).toEqual([]);
    const glsl = compiled.fragmentSrc;
    expect(glsl.indexOf('float vnoise2')).toBeLessThan(glsl.indexOf('float turbulence'));
  });

  it('rejects unknown library imports with the available list', () => {
    expect(() => compile(importOnlyShader('superNoise'))).toThrow(
      /'superNoise' is not a brometal\/shader-functions function — available: hash11/,
    );
  });

  it('rejects aliased library imports', () => {
    const source = `
import { shader, vec4 } from 'brometal';
import { fbm2 as noise } from 'brometal/shader-functions';
export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) { return vec4(aPosition, 1); },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    expect(() => compile(source)).toThrow(/cannot be aliased/);
  });

  it('rejects user helpers that shadow library imports', () => {
    const source = `
import { shader, vec4, type Vec2 } from 'brometal';
import { sdCircle } from 'brometal/shader-functions';

function sdCircle(p: Vec2, radius: number): number {
  return 0;
}

export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) { return vec4(aPosition, 1); },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    expect(() => compile(source)).toThrow(/shadows a function imported from brometal\/shader-functions/);
  });

  it('easing functions clamp/shape as expected in emitted GLSL', () => {
    const compiled = compile(importOnlyShader('easeOutBounce').replace(
      'fragment() { return vec4(1, 1, 1, 1); }',
      `fragment() { const y = easeOutBounce(0.5); return vec4(y, y, y, 1); }`,
    ).replace(
      "import { easeOutBounce } from 'brometal/shader-functions';",
      "import { easeOutBounce } from 'brometal/shader-functions';",
    ));
    expect(compiled.fragmentSrc).toContain('float easeOutBounce(float t) {');
    expect(compiled.fragmentSrc).toContain('7.5625');
  });
});
