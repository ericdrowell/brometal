import { describe, expect, it } from 'vitest';
import { compileShaderSource } from '../src/compiler/compile.js';

function compile(source: string, options?: { optimize?: boolean }) {
  return compileShaderSource('test.shader.ts', source, options);
}

const PLASMA_SHADER = `
import { shader, vec3, vec4, sin, cos, type Vec3 } from 'brometal';

function palette(t: number): Vec3 {
  return vec3(
    0.5 + 0.5 * cos(6.28318 * (t + 0.0)),
    0.5 + 0.5 * cos(6.28318 * (t + 0.33)),
    0.5 + 0.5 * cos(6.28318 * (t + 0.67)),
  );
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime }, { vUv }) {
    const x = vUv.x * 6 - 3;
    const y = vUv.y * 6 - 3;
    let value = 0;
    let frequency = 1;
    let amplitude = 0.6;
    for (let i = 0; i < 5; i += 1) {
      value = value + amplitude * sin(x * frequency + uTime + i * 1.7) * cos(y * frequency - uTime * 0.6 + i * 0.9);
      frequency *= 1.9;
      amplitude *= 0.65;
    }
    return vec4(palette(value * 0.5 + 0.15), 1);
  },
});
`;

describe('custom shaders: helpers, let, and loops', () => {
  it('compiles helper functions into the stages that use them', () => {
    const compiled = compile(PLASMA_SHADER);
    expect(compiled.warnings).toEqual([]);
    expect(compiled.fragmentSrc).toContain('vec3 palette(float t) {');
    expect(compiled.fragmentSrc).toContain('return vec3(');
    expect(compiled.fragmentSrc).toContain('fragColor = vec4(palette(value * 0.5 + 0.15), 1.0);');
    expect(compiled.vertexSrc).not.toContain('palette');
  });

  it('compiles for loops with mutable accumulators', () => {
    const compiled = compile(PLASMA_SHADER);
    expect(compiled.fragmentSrc).toContain('for (float i = 0.0; i < 5.0; i = i + 1.0) {');
    expect(compiled.fragmentSrc).toContain('frequency = frequency * 1.9;');
    expect(compiled.fragmentSrc).toContain('amplitude = amplitude * 0.65;');
  });

  it('supports transitive helper calls and emits them in order', () => {
    const source = `
import { shader, vec4, sin } from 'brometal';

function wave(x: number): number {
  return sin(x * 3.0);
}

function doubleWave(x: number): number {
  return wave(x) + wave(x * 2.0);
}

export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) {
    return vec4(aPosition.x, doubleWave(aPosition.y), aPosition.z, 1);
  },
  fragment() {
    return vec4(1, 1, 1, 1);
  },
});
`;
    const compiled = compile(source);
    const waveIndex = compiled.vertexSrc.indexOf('float wave(float x) {');
    const doubleIndex = compiled.vertexSrc.indexOf('float doubleWave(float x) {');
    expect(waveIndex).toBeGreaterThan(-1);
    expect(doubleIndex).toBeGreaterThan(waveIndex);
  });

  it('rejects recursion (helpers may only call earlier helpers)', () => {
    const source = `
import { shader, vec4 } from 'brometal';

function a(x: number): number {
  return b(x);
}

function b(x: number): number {
  return x;
}

export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) {
    return vec4(aPosition, a(1));
  },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    expect(() => compile(source)).toThrow(/unknown function 'b'/);
  });

  it('type-checks helper calls against their signatures', () => {
    const source = `
import { shader, vec3, vec4, type Vec3 } from 'brometal';

function tint(color: Vec3, amount: number): Vec3 {
  return color.mul(amount);
}

export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) {
    return vec4(tint(1, 2), 1);
  },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    expect(() => compile(source)).toThrow(/tint\(vec3, float\) does not match the arguments \(float, float\)/);
  });

  it('requires annotations on helper parameters', () => {
    const source = `
import { shader, vec4 } from 'brometal';

function bad(x): number {
  return x;
}

export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) { return vec4(aPosition, bad(1)); },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    expect(() => compile(source)).toThrow(/parameters need type annotations/);
  });

  it('warns on never-called helpers', () => {
    const source = `
import { shader, vec4 } from 'brometal';

function unused(x: number): number {
  return x;
}

export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) { return vec4(aPosition, 1); },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    expect(compile(source).warnings).toEqual([
      `test.shader.ts — helper 'unused' is declared but never called`,
    ]);
  });

  it('supports x++ and compound assignment in loop updates', () => {
    const source = `
import { shader, vec4, sin } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) {
    let total = 0;
    for (let i = 0; i < 3; i++) {
      total += sin(i);
    }
    return vec4(aPosition, total);
  },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    const compiled = compile(source);
    expect(compiled.vertexSrc).toContain('for (float i = 0.0; i < 3.0; i = i + 1.0) {');
    expect(compiled.vertexSrc).toContain('total = total + sin(i);');
  });

  it('rejects return inside loops and helper bodies must end with return', () => {
    const returnInLoop = `
import { shader, vec4 } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) {
    for (let i = 0; i < 3; i += 1) {
      return vec4(aPosition, 1);
    }
    return vec4(aPosition, 1);
  },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    expect(() => compile(returnInLoop)).toThrow(/return must be the final top-level statement/);

    const noReturn = `
import { shader, vec4 } from 'brometal';
function broken(x: number): number {
  const y = x * 2;
}
export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) { return vec4(aPosition, broken(1)); },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    expect(() => compile(noReturn)).toThrow(/helper 'broken' must end with a return statement/);
  });

  it('helpers and loops survive the prod optimize/minify pipeline', () => {
    const compiled = compile(PLASMA_SHADER, { optimize: true });
    expect(compiled.fragmentSrc).toContain('vec3 palette(float t){');
    expect(compiled.fragmentSrc).toContain('for(float i=0.0;i<5.0;i=i + 1.0){');
  });

  it('supports the new intrinsics', () => {
    const source = `
import { shader, vec4, atan, smoothstep, mod, distance, vec2 } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  varyings: { vFade: 'float' },
  vertex({ aPosition, aUv }, _u, v) {
    const angle = atan(aUv.y, aUv.x);
    const soft = smoothstep(0, 1, mod(angle, 2));
    v.vFade = soft * distance(aUv, vec2(0.5, 0.5));
    return vec4(aPosition, 1);
  },
  fragment(_u, { vFade }) { return vec4(vFade, vFade, vFade, 1); },
});
`;
    const compiled = compile(source);
    expect(compiled.vertexSrc).toContain('float angle = atan(aUv.y, aUv.x);');
    expect(compiled.vertexSrc).toContain('smoothstep(0.0, 1.0, mod(angle, 2.0))');
  });
});
