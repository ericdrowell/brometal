import type {
  AttributeLayoutEntry,
  GpuType,
  ShaderLayout,
  UniformKind,
  UniformLayoutEntry,
} from '../dsl/types.js';
import type { ShaderIr } from './ir.js';

const COMPONENT_COUNTS: Record<GpuType, number> = {
  float: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
  mat4: 16,
  sampler2D: 1,
};

const UNIFORM_KINDS: Record<GpuType, UniformKind> = {
  float: '1f',
  vec2: '2fv',
  vec3: '3fv',
  vec4: '4fv',
  mat4: 'm4fv',
  sampler2D: '1i',
};

/**
 * Decides the full runtime wiring plan at compile time: attribute locations
 * (matching the layout(location = N) qualifiers in the emitted GLSL), buffer
 * component sizes, instancing divisors, and uniform upload routines.
 */
export function buildLayout(ir: ShaderIr): ShaderLayout {
  const attributes: AttributeLayoutEntry[] = [];
  let location = 0;
  for (const [name, type] of Object.entries(ir.attributes)) {
    attributes.push({ name, type, location: location++, size: COMPONENT_COUNTS[type], divisor: 0 });
  }
  for (const [name, type] of Object.entries(ir.instanceAttributes)) {
    attributes.push({ name, type, location: location++, size: COMPONENT_COUNTS[type], divisor: 1 });
  }

  let nextUnit = 0;
  const uniforms: UniformLayoutEntry[] = Object.entries(ir.uniforms).map(([name, type]) => {
    const entry: UniformLayoutEntry = {
      name,
      type,
      kind: UNIFORM_KINDS[type],
      size: COMPONENT_COUNTS[type],
    };
    if (type === 'sampler2D') {
      entry.unit = nextUnit++;
    }
    return entry;
  });

  return { attributes, uniforms };
}
