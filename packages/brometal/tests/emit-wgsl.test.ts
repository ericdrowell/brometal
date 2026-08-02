import { describe, expect, it } from 'vitest';
import { compileShaderSource } from '../src/compiler/compile.js';
import { buildGeneratedModule } from '../src/compiler/emit-module.js';
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
    const scaled = total * 0.25;
    return vec4(tint(scaled), 1);
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
    expect(wgsl).toContain('let scaled = total * 0.25;');
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

describe('targetUv', () => {
  const SHADER = `
import { shader, vec4, texture, targetUv } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uLightViewProj: 'mat4', uMap: 'sampler2D' },
  varyings: { vClip: 'vec4' },

  vertex({ aPosition }, { uLightViewProj }, v) {
    v.vClip = uLightViewProj.mul(vec4(aPosition, 1));
    return vec4(aPosition, 1);
  },

  fragment({ uMap }, { vClip }) {
    return texture(uMap, targetUv(vClip));
  },
});
`;

  it('inverts v on WebGPU, where NDC +y is the target’s first row', () => {
    const wgsl = compileShaderSource('t.shader.ts', SHADER).wgslSrc!;
    expect(wgsl).toContain('(bm_in.vClip).xy / (bm_in.vClip).w * vec2f(0.5, -0.5) + vec2f(0.5)');
  });


  it('inverts v, because NDC y and texture v run opposite ways', () => {
    // Not a cross-backend concern any more, but still a real one: WebGPU puts
    // NDC +y at a target's first row while texture v runs top-down. Dropping the
    // negation mirrors every shadow about the light's horizontal axis, which
    // reads as a lighting bug rather than a uv one.
    const compiled = compileShaderSource('t.shader.ts', SHADER);
    expect(compiled.wgslSrc).toContain('vec2f(0.5, -0.5)');
  });

  it('rejects anything that is not a clip-space vec4', () => {
    expect(() =>
      compileShaderSource(
        't.shader.ts',
        SHADER.replace('targetUv(vClip)', 'targetUv(vClip.xy)'),
      ),
    ).toThrow(/targetUv/);
  });
});

describe('sampler parameters in helper functions', () => {
  const SHADER = `
import { shader, vec4, texture } from 'brometal';
import type { Sampler2D, Vec2 } from 'brometal';

function tap(map: Sampler2D, uv: Vec2): number {
  return texture(map, uv).x;
}

export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uMap: 'sampler2D' },
  varyings: { vUv: 'vec2' },
  vertex({ aPosition }, _u, v) {
    v.vUv = aPosition.xy;
    return vec4(aPosition, 1);
  },
  fragment({ uMap }, { vUv }) {
    return vec4(tap(uMap, vUv), 0, 0, 1);
  },
});
`;

  it('expands one sampler parameter into a texture and a sampler', () => {
    // WGSL keeps the two as separate objects, so a single DSL parameter has to
    // become two — and the sampler must be named `<name>_sampler`, because that
    // is what `texture()` inside the body emits.
    const wgsl = compileShaderSource('t.shader.ts', SHADER).wgslSrc!;
    expect(wgsl).toContain('fn tap(map : texture_2d<f32>, map_sampler : sampler, uv : vec2f)');
  });

  it('expands the argument at the call site to match', () => {
    const wgsl = compileShaderSource('t.shader.ts', SHADER).wgslSrc!;
    expect(wgsl).toContain('tap(uMap, uMap_sampler, bm_in.vUv)');
  });


  it('rejects a parameter type that is not a GPU type', () => {
    expect(() =>
      compileShaderSource('t.shader.ts', SHADER.replace('map: Sampler2D', 'map: string')),
    ).toThrow(/Sampler2D/);
  });
});

describe('shadowFactor', () => {
  const SHADER = `
import { shader, vec3, vec4 } from 'brometal';
import { shadowFactor } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  uniforms: {
    uViewProj: 'mat4', uLightViewProj: 'mat4', uShadowMap: 'sampler2D',
    uLightPos: 'vec3', uRange: 'float', uTexel: 'float', uSoftness: 'float', uBias: 'float',
  },
  varyings: { vWorld: 'vec3', vNormal: 'vec3' },
  vertex({ aPosition, aNormal }, { uViewProj }, v) {
    v.vWorld = aPosition;
    v.vNormal = aNormal;
    return uViewProj.mul(vec4(aPosition, 1));
  },
  fragment({ uLightViewProj, uShadowMap, uLightPos, uRange, uTexel, uSoftness, uBias }, { vWorld, vNormal }) {
    const lit = shadowFactor(uShadowMap, uLightViewProj, vWorld, vNormal, uLightPos, uRange, uTexel, uSoftness, uBias);
    return vec4(vec3(lit, 0, 0), 1);
  },
});
`;

  it('resolves the shadow-map uv per backend, which is the whole point of it', () => {
    // Hand-rolling this uv gets the v flip wrong and mirrors every shadow.
    const compiled = compileShaderSource('t.shader.ts', SHADER);
    expect(compiled.wgslSrc).toContain('vec2f(0.5, -0.5)');
  });

  it('pulls in shadowDepth, so the map and the comparison share one formula', () => {
    const wgsl = compileShaderSource('t.shader.ts', SHADER).wgslSrc;
    expect(wgsl).toContain('fn shadowDepth(');
    expect(wgsl).toContain('shadowDepth(lookup, lightPos, range)');
  });

  it('evaluates the light-space projection once, not once per component', () => {
    // targetUv divides xy by w, so passing the mat4 product inline would emit
    // the whole multiply twice.
    const wgsl = compileShaderSource('t.shader.ts', SHADER).wgslSrc;
    const multiplies = wgsl.split('lightViewProj * vec4f(lookup').length - 1;
    expect(multiplies).toBe(1);
  });
});

const STORAGE_SHADER = `
import { shader, vec4, storageRead, storageLength } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uCount: 'float' },
  storage: { uWave: 'vec2' },
  varyings: { vAmp: 'float' },

  vertex({ aPosition }, { uWave, uCount }, v) {
    const picked = storageRead(uWave, uCount);
    v.vAmp = picked.x + storageLength(uWave);
    return vec4(aPosition, 1);
  },

  fragment({ uWave }, { vAmp }) {
    const tail = storageRead(uWave, 0);
    return vec4(vAmp, tail.y, 0, 1);
  },
});
`;

describe('storage buffers', () => {
  it('declares a read-only storage array and keeps it out of the uniform block', () => {
    const wgsl = compile(STORAGE_SHADER).wgslSrc!;
    expect(wgsl).toContain('var<storage, read> uWave : array<vec2f>');
    // The buffer is not a uniform-block member — it has its own binding.
    expect(wgsl).toContain('struct BmUniforms {\n  uCount : f32,\n}');
    expect(wgsl).not.toContain('uWave : vec2f,');
  });

  it('resolves storageRead to the buffer element type', () => {
    // .x and .y are only legal if storageRead returned a vec2 rather than a
    // scalar — the element type comes from the storage record, not the args.
    expect(() => compile(STORAGE_SHADER)).not.toThrow();
  });

  it('lowers storage access to indexing, not to a call', () => {
    const wgsl = compile(STORAGE_SHADER).wgslSrc!;
    // WGSL has no storageRead(); it indexes the array directly, and the float
    // index has to be narrowed to u32.
    expect(wgsl).not.toContain('storageRead(');
    expect(wgsl).not.toContain('storageLength(');
    expect(wgsl).toContain('uWave[u32(bm_u.uCount)]');
    expect(wgsl).toContain('f32(arrayLength(&uWave))');
  });


  it('reports a useful error when storageRead is given a non-buffer', () => {
    const bad = STORAGE_SHADER.replace('storageRead(uWave, uCount)', 'storageRead(uCount, uCount)');
    expect(() => compile(bad)).toThrow(/storageRead\(buffer, index\)/);
  });
});

const COMPUTE_SHADER = `
import { shader, vec2, storageWrite, storageRead, storageLength } from 'brometal';

export default shader({
  uniforms: { uScale: 'float' },
  storage: { uIn: 'vec2', uOut: 'vec2' },
  workgroupSize: [32, 2, 1],

  compute({ uIn, uOut, uScale }, id) {
    const source = storageRead(uIn, id.x);
    storageWrite(uOut, id.x, vec2(source.x * uScale, source.y + storageLength(uIn)));
  },
});
`;

describe('compute stage', () => {
  it('emits a compute entry point with the declared workgroup size', () => {
    const wgsl = compile(COMPUTE_SHADER).wgslSrc!;
    expect(wgsl).toContain('@compute @workgroup_size(32, 2, 1)');
    expect(wgsl).toContain('fn cs_main(@builtin(global_invocation_id) bm_gid : vec3u)');
    // The DSL is float-only, so the u32 id is converted once at entry.
    expect(wgsl).toContain('let id = vec3f(bm_gid);');
  });

  it('picks the access mode per buffer', () => {
    const wgsl = compile(COMPUTE_SHADER).wgslSrc!;
    // Only the written buffer is read_write; leaving both would block
    // read-only optimisation in the driver.
    expect(wgsl).toContain('var<storage, read> uIn : array<vec2f>');
    expect(wgsl).toContain('var<storage, read_write> uOut : array<vec2f>');
  });

  it('lowers storageWrite to an indexed assignment', () => {
    const wgsl = compile(COMPUTE_SHADER).wgslSrc!;
    expect(wgsl).toContain('uOut[u32(id.x)] =');
    expect(wgsl).not.toContain('storageWrite(');
  });

  it('emits no render entry points for a compute-only shader', () => {
    const compiled = compile(COMPUTE_SHADER);
    expect(compiled.wgslSrc).not.toContain('@vertex');
    expect(compiled.wgslSrc).not.toContain('@fragment');
  });

  it('rejects storageWrite outside compute()', () => {
    const bad = STORAGE_SHADER.replace(
      'const tail = storageRead(uWave, 0);',
      'storageWrite(uWave, 0, tail); const tail = storageRead(uWave, 0);',
    );
    expect(() => compile(bad)).toThrow(/only allowed in compute\(\)/);
  });
});

describe('compute-only WGSL validity', () => {
  it('emits no empty render structs', () => {
    const wgsl = compile(COMPUTE_SHADER).wgslSrc!;
    // WGSL structs must have at least one member, so an attribute-less shader
    // must not declare BmVSIn at all.
    expect(wgsl).not.toContain('struct BmVSIn');
    expect(wgsl).not.toContain('struct BmVSOut');
  });
});

describe('compute metadata reaches the runtime', () => {
  it('reports hasCompute and which buffers are written', () => {
    const compiled = compile(COMPUTE_SHADER);
    // The runtime needs both: hasCompute to allow dispatch(), and storageWritten
    // to bind those buffers as 'storage' rather than 'read-only-storage'.
    expect(compiled.hasCompute).toBe(true);
    expect(compiled.storageWritten).toEqual(['uOut']);
  });

  it('carries them into the generated module', () => {
    const module = buildGeneratedModule('computeShader', compile(COMPUTE_SHADER));
    expect(module).toContain('hasCompute: true');
    expect(module).toContain('storageWritten: ["uOut"]');
  });
});
