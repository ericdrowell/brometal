/**
 * Packs `MeshInstance` records into the three instance arrays the world-mesh and
 * world-grass shaders expect.
 *
 * The scenery in this world never moves, so these are built once and uploaded
 * once — `draw({ instanceCount })` then draws whatever the count is without the
 * arrays ever being touched again.
 */
import type { MeshInstance } from './world';

export interface MeshInstanceArrays {
  /** vec3 per instance */
  positions: Float32Array;
  /** vec2 per instance: uniform scale, yaw in radians */
  scaleYaw: Float32Array;
  /** vec3 per instance */
  tints: Float32Array;
  count: number;
}

export function packInstances(instances: readonly MeshInstance[]): MeshInstanceArrays {
  const count = instances.length;
  const positions = new Float32Array(Math.max(count, 1) * 3);
  const scaleYaw = new Float32Array(Math.max(count, 1) * 2);
  const tints = new Float32Array(Math.max(count, 1) * 3);
  for (let i = 0; i < count; i++) {
    const instance = instances[i]!;
    positions[i * 3] = instance.x;
    positions[i * 3 + 1] = instance.y;
    positions[i * 3 + 2] = instance.z;
    scaleYaw[i * 2] = instance.scale;
    scaleYaw[i * 2 + 1] = instance.yaw;
    tints[i * 3] = instance.tint[0];
    tints[i * 3 + 1] = instance.tint[1];
    tints[i * 3 + 2] = instance.tint[2];
  }
  return { positions, scaleYaw, tints, count };
}
