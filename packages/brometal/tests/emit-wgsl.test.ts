import { describe, expect, it } from 'vitest';
import { compileShaderSource } from '../src/compiler/compile.js';
import { CUBE_SHADER, INSTANCED_SHADER } from './fixtures.js';

function compile(source: string) {
  return compileShaderSource('test.shader.ts', source);
}

describe('WGSL backend', () => {
  it('emits the cube shader as a two-entry-point WGSL module', () => {
    const wgsl = compile(CUBE_SHADER).wgslSrc!;
    expect(wgsl).toContain('struct BmUniforms {\n  uMvp : mat4x4f,\n}');
    expect(wgsl).toContain('@group(0) @binding(0) var<uniform> bm_u : BmUniforms;');
    expect(wgsl).toContain('@location(0) aPosition : vec3f,');
    expect(wgsl).toContain('@location(1) aColor : vec3f,');
    expect(wgsl).toContain('@builtin(position) bm_position : vec4f,');
    expect(wgsl).toContain('@location(0) vColor : vec3f,');
    expect(wgsl).toContain('bm_out.vColor = bm_in.aColor;');
    expect(wgsl).toContain('bm_out.bm_position = bm_u.uMvp * vec4f(bm_in.aPosition, 1.0);');
    expect(wgsl).toContain('return vec4f(bm_in.vColor, 1.0);');
  });

  it('remaps clip-space z from GL [-w, w] to WebGPU [0, w]', () => {
    const wgsl = compile(CUBE_SHADER).wgslSrc!;
    expect(wgsl).toContain('bm_out.bm_position.z = (bm_out.bm_position.z + bm_out.bm_position.w) * 0.5;');
  });

  it('declares instance attributes at their compile-time locations', () => {
    const wgsl = compile(INSTANCED_SHADER).wgslSrc!;
    expect(wgsl).toContain('@location(2) iOffset : vec3f,');
    expect(wgsl).toContain('@location(4) iSpeed : f32,');
  });

  it('emits texture/sampler bindings and textureSample in fragment', () => {
    const source = `
import { shader, vec4, texture } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uScale: 'float', uTex: 'sampler2D' },
  varyings: { vUv: 'vec2' },
  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },
  fragment({ uScale, uTex }, { vUv }) {
    return texture(uTex, vUv).mul(uScale);
  },
});
`;
    const wgsl = compile(source).wgslSrc!;
    expect(wgsl).toContain('@group(0) @binding(1) var uTex : texture_2d<f32>;');
    expect(wgsl).toContain('@group(0) @binding(2) var uTex_sampler : sampler;');
    expect(wgsl).toContain('textureSample(uTex, uTex_sampler, bm_in.vUv)');
  });

  it('emits helpers, loops, and var/let with WGSL keywords', () => {
    const source = `
import { shader, vec3, vec4, sin, type Vec3 } from 'brometal';

function tint(t: number): Vec3 {
  return vec3(t, t, t);
}

export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uTime: 'float' },
  vertex({ aPosition }, { uTime }) {
    let total = 0;
    for (let i = 0; i < 4; i += 1) {
      total += sin(i + uTime);
    }
    const fixed = total * 0.25;
    return vec4(tint(fixed), 1);
  },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    const wgsl = compile(source).wgslSrc!;
    expect(wgsl).toContain('fn tint(t : f32) -> vec3f {');
    expect(wgsl).toContain('return vec3f(t, t, t);');
    expect(wgsl).toContain('var total = 0.0;');
    expect(wgsl).toContain('for (var i = 0.0; i < 4.0; i = i + 1.0) {');
    expect(wgsl).toContain('total = total + sin(i + bm_u.uTime);');
    expect(wgsl).toContain('let fixed = total * 0.25;');
  });

  it('maps atan(y, x) to atan2 and mod to floor-based remainder', () => {
    const source = `
import { shader, vec4, atan, mod } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  vertex({ aPosition, aUv }) {
    const angle = atan(aUv.y, aUv.x);
    const wrapped = mod(angle, 6.28318);
    return vec4(aPosition, wrapped);
  },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    const wgsl = compile(source).wgslSrc!;
    expect(wgsl).toContain('atan2(bm_in.aUv.y, bm_in.aUv.x)');
    expect(wgsl).toContain('((angle) - (6.28318) * floor((angle) / (6.28318)))');
  });

  it('splats scalar bounds for vector clamp (WGSL has no mixed overload)', () => {
    const source = `
import { shader, vec3, vec4, clamp } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3' },
  vertex({ aPosition }) {
    const bounded = clamp(aPosition.scale(2), 0, 1);
    return vec4(bounded, 1);
  },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    const wgsl = compile(source).wgslSrc!;
    expect(wgsl).toContain('clamp(bm_in.aPosition * 2.0, vec3f(0.0), vec3f(1.0))');
  });

  it('honors target selection', () => {
    const webglOnly = compileShaderSource('t.shader.ts', CUBE_SHADER, { targets: ['webgl2'] });
    expect(webglOnly.wgslSrc).toBeUndefined();
    expect(webglOnly.vertexSrc).toContain('#version 300 es');

    const webgpuOnly = compileShaderSource('t.shader.ts', CUBE_SHADER, { targets: ['webgpu'] });
    expect(webgpuOnly.wgslSrc).toContain('@vertex');
    expect(webgpuOnly.vertexSrc).toBe('');
  });
});

describe('WGSL mod() polyfill', () => {
  it('parenthesizes compound operands', () => {
    const compiled = compile(`
import { shader, vec4, mod } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uOffset: 'float', uScroll: 'float', uWrap: 'float' },
  vertex({ aPosition }, { uOffset, uScroll, uWrap }) {
    const z = mod(uOffset + uScroll, uWrap) - 1;
    return vec4(aPosition.x, aPosition.y, z, 1);
  },
  fragment() { return vec4(1, 1, 1, 1); },
});
`);
    const wgsl = compiled.wgslSrc!;
    // The dividend must be parenthesized inside floor(); without it,
    // mod(x + y, w) emits floor(x + y / w) and wraps at the wrong values.
    expect(wgsl).toContain('floor((bm_u.uOffset + bm_u.uScroll) / (bm_u.uWrap))');
  });
});
