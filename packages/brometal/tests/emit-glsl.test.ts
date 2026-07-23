import { describe, expect, it } from 'vitest';
import { compileShaderSource } from '../src/compiler/compile.js';
import { BRANCHING_SHADER, CUBE_SHADER, INSTANCED_SHADER, LIGHTING_SHADER } from './fixtures.js';

function compile(source: string) {
  return compileShaderSource('test.shader.ts', source);
}

describe('GLSL emission', () => {
  it('compiles the cube shader to the expected vertex GLSL', () => {
    expect(compile(CUBE_SHADER).vertexSrc).toBe(
      `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;
uniform mat4 uMvp;
out vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = uMvp * vec4(aPosition, 1.0);
}
`,
    );
  });

  it('compiles the cube shader to the expected fragment GLSL, omitting unused uniforms', () => {
    expect(compile(CUBE_SHADER).fragmentSrc).toBe(
      `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(vColor, 1.0);
}
`,
    );
  });

  it('compiles intrinsics, consts, and multi-uniform fragments', () => {
    expect(compile(LIGHTING_SHADER).fragmentSrc).toBe(
      `#version 300 es
precision highp float;
uniform vec3 uLightDir;
uniform float uAmbient;
in vec3 vNormal;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, normalize(uLightDir)), 0.0);
  float intensity = clamp(uAmbient + diffuse, 0.0, 1.0);
  vec3 base = vec3(0.8, 0.3, 0.2);
  vec3 lit = mix(vec3(0.0, 0.0, 0.0), base, intensity);
  fragColor = vec4(lit, 1.0);
}
`,
    );
  });

  it('compiles if/else, comparisons, unary minus, and float promotion', () => {
    expect(compile(BRANCHING_SHADER).vertexSrc).toBe(
      `#version 300 es
layout(location = 0) in vec2 aPosition;
uniform float uThreshold;
out float vFade;
void main() {
  vFade = 0.5;
  if (aPosition.x < uThreshold) {
    float boosted = aPosition.x * 2.0 + 1.0;
    vFade = boosted;
  } else {
    vFade = -aPosition.y;
  }
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`,
    );
  });

  it('declares instance attributes as vertex inputs and computes rotation on the GPU', () => {
    expect(compile(INSTANCED_SHADER).vertexSrc).toBe(
      `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;
layout(location = 2) in vec3 iOffset;
layout(location = 3) in vec3 iAxis;
layout(location = 4) in float iSpeed;
uniform mat4 uViewProj;
uniform float uTime;
out vec3 vColor;
void main() {
  float angle = uTime * iSpeed;
  float c = cos(angle);
  float s = sin(angle);
  vec3 rotated = aPosition * c + cross(iAxis, aPosition) * s + iAxis * (dot(iAxis, aPosition) * (1.0 - c));
  vColor = aColor;
  gl_Position = uViewProj * vec4(rotated + iOffset, 1.0);
}
`,
    );
  });

  it('exposes instance attributes in the compiled interface', () => {
    const compiled = compile(INSTANCED_SHADER);
    expect(compiled.instanceAttributes).toEqual({ iOffset: 'vec3', iAxis: 'vec3', iSpeed: 'float' });
    expect(compile(CUBE_SHADER).instanceAttributes).toEqual({});
  });

  it('exposes the shader interface for runtime wiring', () => {
    const compiled = compile(CUBE_SHADER);
    expect(compiled.attributes).toEqual({ aPosition: 'vec3', aColor: 'vec3' });
    expect(compiled.uniforms).toEqual({ uMvp: 'mat4' });
    expect(compiled.varyings).toEqual({ vColor: 'vec3' });
  });

  it('precomputes the full wiring layout at compile time', () => {
    const { layout } = compile(INSTANCED_SHADER);
    expect(layout.attributes).toEqual([
      { name: 'aPosition', type: 'vec3', location: 0, size: 3, divisor: 0 },
      { name: 'aColor', type: 'vec3', location: 1, size: 3, divisor: 0 },
      { name: 'iOffset', type: 'vec3', location: 2, size: 3, divisor: 1 },
      { name: 'iAxis', type: 'vec3', location: 3, size: 3, divisor: 1 },
      { name: 'iSpeed', type: 'float', location: 4, size: 1, divisor: 1 },
    ]);
    expect(layout.uniforms).toEqual([
      { name: 'uViewProj', type: 'mat4', kind: 'm4fv', size: 16, offset: 0 },
      { name: 'uTime', type: 'float', kind: '1f', size: 1, offset: 64 },
    ]);
    expect(layout.uniformBlockSize).toBe(80);
  });

  it('emits mediump fragment precision when requested', () => {
    const compiled = compileShaderSource('test.shader.ts', CUBE_SHADER, { precision: 'mediump' });
    expect(compiled.fragmentSrc).toContain('precision mediump float;');
    expect(compile(CUBE_SHADER).fragmentSrc).toContain('precision highp float;');
  });

  it('parenthesizes according to precedence', () => {
    const source = `
import { shader, vec4 } from 'brometal';
export default shader({
  attributes: { aWeight: 'float' },
  vertex({ aWeight }) {
    const scaled = (aWeight + 1) * (aWeight - 2) / 4;
    return vec4(scaled, scaled, scaled, 1);
  },
  fragment() {
    return vec4(1, 1, 1, 1);
  },
});
`;
    expect(compile(source).vertexSrc).toContain(
      'float scaled = (aWeight + 1.0) * (aWeight - 2.0) / 4.0;',
    );
  });

  it('translates vector methods to operators with parens', () => {
    const source = `
import { shader, vec3, vec4 } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3', aOffset: 'vec3' },
  vertex({ aPosition, aOffset }) {
    const moved = aPosition.add(aOffset).scale(2);
    return vec4(moved, 1);
  },
  fragment() {
    return vec4(1, 1, 1, 1);
  },
});
`;
    expect(compile(source).vertexSrc).toContain('vec3 moved = (aPosition + aOffset) * 2.0;');
  });
});
