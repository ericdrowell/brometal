import { describe, expect, it } from 'vitest';
import { compileShaderSource } from '../src/compiler/compile.js';

function compile(source: string, options?: { optimize?: boolean }) {
  return compileShaderSource('test.shader.ts', source, options);
}

const TEXTURED_LIT_SHADER = `
import { shader, vec3, vec4, texture, normalize, dot, max, pow } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aUv: 'vec2' },
  uniforms: { uViewProj: 'mat4', uModel: 'mat4', uLightPos: 'vec3', uViewPos: 'vec3', uTex: 'sampler2D' },
  varyings: { vNormal: 'vec3', vUv: 'vec2', vWorldPos: 'vec3' },

  vertex({ aPosition, aNormal, aUv }, { uViewProj, uModel }, v) {
    const world = uModel.mul(vec4(aPosition, 1));
    v.vWorldPos = world.xyz;
    v.vNormal = uModel.mul(vec4(aNormal, 0)).xyz;
    v.vUv = aUv;
    return uViewProj.mul(world);
  },

  fragment({ uLightPos, uViewPos, uTex }, { vNormal, vUv, vWorldPos }) {
    const ambient = 0.25;
    const n = normalize(vNormal);
    const lightDir = normalize(uLightPos.sub(vWorldPos));
    const diffuse = max(dot(n, lightDir), 0);
    const viewDir = normalize(uViewPos.sub(vWorldPos));
    const halfway = normalize(lightDir.add(viewDir));
    const specular = pow(max(dot(n, halfway), 0), 32) * 0.4;
    const base = texture(uTex, vUv).xyz;
    const lit = base.mul(ambient + diffuse).add(vec3(1, 1, 1).scale(specular));
    return vec4(lit, 1);
  },
});
`;

describe('textures and lighting', () => {
  it('compiles a textured Blinn-Phong shader to valid GLSL', () => {
    const compiled = compile(TEXTURED_LIT_SHADER);
    expect(compiled.warnings).toEqual([]);
    expect(compiled.fragmentSrc).toContain('uniform sampler2D uTex;');
    expect(compiled.fragmentSrc).toContain('vec3 base = texture(uTex, vUv).xyz;');
    expect(compiled.fragmentSrc).toContain(
      'float specular = pow(max(dot(n, halfway), 0.0), 32.0) * 0.4;',
    );
    expect(compiled.vertexSrc).toContain('vWorldPos = world.xyz;');
    expect(compiled.vertexSrc).not.toContain('sampler2D');
  });

  it('assigns texture units at compile time', () => {
    const source = `
import { shader, vec4, texture } from 'brometal';
export default shader({
  attributes: { aUv: 'vec2' },
  uniforms: { uScale: 'float', uTexA: 'sampler2D', uTexB: 'sampler2D' },
  varyings: { vUv: 'vec2' },
  vertex({ aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aUv, 0, 1);
  },
  fragment({ uScale, uTexA, uTexB }, { vUv }) {
    return texture(uTexA, vUv).mul(texture(uTexB, vUv)).mul(uScale);
  },
});
`;
    const { layout } = compile(source);
    expect(layout.uniforms).toEqual([
      { name: 'uScale', type: 'float', kind: '1f', size: 1, offset: 0 },
      { name: 'uTexA', type: 'sampler2D', kind: '1i', size: 1, unit: 0, textureBinding: 1, samplerBinding: 2 },
      { name: 'uTexB', type: 'sampler2D', kind: '1i', size: 1, unit: 1, textureBinding: 3, samplerBinding: 4 },
    ]);
    expect(layout.uniformBlockSize).toBe(16);
  });

  it('supports the reflect intrinsic', () => {
    const source = `
import { shader, vec4, reflect, normalize } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  varyings: { vColor: 'vec3' },
  vertex({ aPosition, aNormal }, _u, v) {
    v.vColor = reflect(normalize(aPosition), normalize(aNormal));
    return vec4(aPosition, 1);
  },
  fragment(_u, { vColor }) {
    return vec4(vColor, 1);
  },
});
`;
    expect(compile(source).vertexSrc).toContain(
      'vColor = reflect(normalize(aPosition), normalize(aNormal));',
    );
  });

  it('rejects sampler2D outside uniforms', () => {
    const attribute = `
import { shader, vec4 } from 'brometal';
export default shader({
  attributes: { aTex: 'sampler2D' },
  vertex() { return vec4(1, 1, 1, 1); },
  fragment() { return vec4(1, 1, 1, 1); },
});
`;
    expect(() => compile(attribute)).toThrow(/'sampler2D' is only supported for uniforms/);
  });

  it('rejects sampler consts and type-checks texture() arguments', () => {
    const samplerConst = `
import { shader, vec4, texture } from 'brometal';
export default shader({
  attributes: { aUv: 'vec2' },
  uniforms: { uTex: 'sampler2D' },
  vertex({ aUv }) { return vec4(aUv, 0, 1); },
  fragment({ uTex }) {
    const t = uTex;
    return texture(t, vec2(0, 0));
  },
});
`;
    expect(() => compile(samplerConst)).toThrow(/sampler variables are not supported/);

    const badArgs = `
import { shader, vec4, texture } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uTex: 'sampler2D' },
  vertex({ aPosition }) { return vec4(aPosition, 1); },
  fragment({ uTex }) {
    return texture(uTex, 1);
  },
});
`;
    expect(() => compile(badArgs)).toThrow(/texture\(sampler, uv\) expects a sampler2D and a vec2/);
  });
});
