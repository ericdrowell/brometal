import { describe, expect, it } from 'vitest';
import { compileShaderSource } from '../src/compiler/compile.js';
import type { Vec2, Vec3, Vec4 } from '../src/dsl/types.js';

function compile(source: string) {
  return compileShaderSource('test.shader.ts', source);
}

/**
 * Type-level coverage. These assignments never run — they exist so
 * `tsc -p tsconfig.test.json` fails if the swizzle types stop covering what the
 * compiler accepts. Before `Swizzles<C>`, `v4.zw` was a TS2339 error while
 * compiling to perfectly good GLSL.
 */
function typeLevel(v2: Vec2, v3: Vec3, v4: Vec4): void {
  const _a: Vec2 = v4.zw;
  const _b: Vec2 = v4.wz;
  const _c: Vec3 = v4.zyx;
  const _d: Vec4 = v4.wzyx;
  const _e: Vec2 = v3.zy;
  const _f: Vec3 = v3.zzz;
  const _g: Vec4 = v3.xyzz;
  const _h: Vec2 = v2.yx;
  const _i: Vec3 = v2.xyx;
  const _j: Vec4 = v2.yyxx;
  const _k: number = v4.w;
  const _l: number = v2.y;
  void [_a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l];
}

const ATLAS_RECT_SHADER = `
import { shader, vec4 } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  instanceAttributes: { iUvRect: 'vec4' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv, iUvRect }, _u, v) {
    // The natural spelling for an atlas sub-rect: xy = origin, zw = size.
    v.vUv = iUvRect.xy.add(aUv.mul(iUvRect.zw));
    return vec4(aPosition, 1);
  },

  fragment(_u, { vUv }) {
    return vec4(vUv.yx, 0, 1);
  },
});
`;

describe('swizzles', () => {
  it('type-checks every swizzle the compiler accepts', () => {
    // The assertion is that this file compiles under tsconfig.test.json; the
    // runtime body only needs to exist.
    expect(typeof typeLevel).toBe('function');
  });

  it('compiles .zw and .yx to GLSL', () => {
    const compiled = compile(ATLAS_RECT_SHADER);
    expect(compiled.vertexSrc).toContain('iUvRect.xy + aUv * iUvRect.zw');
    expect(compiled.fragmentSrc).toContain('vec4(vUv.yx, 0.0, 1.0)');
  });

  it('compiles the same swizzles to WGSL', () => {
    const wgsl = compile(ATLAS_RECT_SHADER).wgslSrc ?? '';
    expect(wgsl).toContain('.zw');
    expect(wgsl).toContain('.yx');
  });

  it('still rejects a component the vector does not have', () => {
    const source = `
import { shader, vec4 } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec2' },
  varyings: { vFade: 'float' },
  vertex({ aPosition }, _u, v) { v.vFade = aPosition.z; return vec4(aPosition, 0, 1); },
  fragment(_u, { vFade }) { return vec4(vFade, 0, 0, 1); },
});
`;
    expect(() => compile(source)).toThrow(/component 'z' is out of range for vec2/);
  });
});

/**
 * Component-wise intrinsics. GLSL and WGSL both implement the `genType` rule
 * natively, so widening the type checks needed no emitter change — these goldens
 * exist to prove the emitted text really is the plain vector call.
 */
const COMPONENTWISE_SHADER = `
import { shader, vec2, vec3, vec4, fract, abs, floor, max, min, mod, step, smoothstep, mix, clamp, pow, sign, sqrt, sin } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uLo: 'vec3', uHi: 'vec3' },
  varyings: { vTile: 'vec2', vColor: 'vec3' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vTile = fract(aUv.scale(8));
    v.vColor = abs(aPosition);
    return vec4(aPosition, 1);
  },

  fragment({ uLo, uHi }, { vTile, vColor }) {
    const a = max(vColor, vec3(0, 0, 0));
    const b = min(a, vec3(1, 1, 1));
    const c = mod(b, vec3(0.5, 0.5, 0.5));
    const d = step(vec3(0.2, 0.2, 0.2), c);
    const e = smoothstep(uLo, uHi, d);
    const f = mix(e, vec3(1, 1, 1), vec3(0.5, 0.5, 0.5));
    const g = clamp(f, uLo, uHi);
    const h = pow(g, vec3(2, 2, 2));
    const i = sign(h).add(sqrt(h)).add(sin(h)).add(floor(h));
    return vec4(i.add(vec3(vTile.x, vTile.y, 0)), 1);
  },
});
`;

describe('component-wise intrinsics', () => {
  it('accepts vectors and emits the plain GLSL call', () => {
    const glsl = compile(COMPONENTWISE_SHADER).fragmentSrc;
    expect(glsl).toContain('max(vColor, vec3(0.0, 0.0, 0.0))');
    expect(glsl).toContain('smoothstep(uLo, uHi, d)');
    expect(glsl).toContain('mix(e, vec3(1.0, 1.0, 1.0), vec3(0.5, 0.5, 0.5))');
    expect(glsl).toContain('clamp(f, uLo, uHi)');
    expect(compile(COMPONENTWISE_SHADER).vertexSrc).toContain('fract(aUv * 8.0)');
  });

  it('does not splat clamp bounds that are already vectors', () => {
    const wgsl = compile(COMPONENTWISE_SHADER).wgslSrc ?? '';
    expect(wgsl).toContain('clamp(f, bm_u.uLo, bm_u.uHi)');
    // The splat form would read clamp(f, vec3f(bm_u.uLo), ...) — invalid WGSL.
    expect(wgsl).not.toContain('vec3f(bm_u.uLo)');
    expect(wgsl).toContain('smoothstep(bm_u.uLo, bm_u.uHi, d)');
  });

  it('still splats clamp bounds that are scalar', () => {
    const source = `
import { shader, vec3, vec4, clamp } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3' },
  varyings: { vC: 'vec3' },
  vertex({ aPosition }, _u, v) { v.vC = clamp(aPosition, 0, 1); return vec4(aPosition, 1); },
  fragment(_u, { vC }) { return vec4(vC, 1); },
});
`;
    const wgsl = compile(source).wgslSrc ?? '';
    expect(wgsl).toContain('clamp(bm_in.aPosition, vec3f(0.0), vec3f(1.0))');
  });

  it('still rejects mismatched vector widths', () => {
    const source = `
import { shader, vec2, vec3, vec4, max } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3' },
  varyings: { vC: 'vec3' },
  vertex({ aPosition }, _u, v) { v.vC = max(aPosition, vec2(0, 0)); return vec4(aPosition, 1); },
  fragment(_u, { vC }) { return vec4(vC, 1); },
});
`;
    expect(() => compile(source)).toThrow(/max\(a, b\) expects two floats, or two vectors of the same type/);
  });
});
