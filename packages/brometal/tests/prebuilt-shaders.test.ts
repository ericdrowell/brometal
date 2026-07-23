import { describe, expect, it } from 'vitest';
import * as prebuilt from '../src/shaders/index.js';
import type { CompiledShader } from '../src/dsl/types.js';

const entries = Object.entries(prebuilt) as [string, CompiledShader][];

describe('brometal/shaders prebuilt modules', () => {
  it('exports 30 compiled shaders with the expected naming', () => {
    expect(entries.length).toBe(30);
    for (const [name] of entries) {
      expect(name).toMatch(/Shader$/);
    }
    expect(Object.keys(prebuilt)).toContain('fireShader');
    expect(Object.keys(prebuilt)).toContain('raymarchShader');
  });

  it.each(entries.map(([name]) => name))('%s carries GLSL, WGSL, and a layout', (name) => {
    const shader = (prebuilt as Record<string, CompiledShader>)[name]!;
    expect(shader.vertexSrc).toContain('#version 300 es');
    expect(shader.wgslSrc).toContain('@vertex');
    expect(shader.layout.attributes.length).toBeGreaterThan(0);
    expect(shader.uniforms).toHaveProperty('uTime');
  });
});
