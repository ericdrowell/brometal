import {
  abs,
  atomicAdd,
  floor,
  length,
  mod,
  shader,
  storageWrite,
  vec3,
  vec4,
} from 'brometal';

/** GPU frustum culling and screen-distance LOD queue construction. */
export const NaniteCull = shader({
  uniforms: { uViewProj: 'mat4', uCamera: 'vec3' },
  storage: {
    uHighVisible: 'float',
    uMidVisible: 'float',
    uLowVisible: 'float',
    uHighArgs: 'atomic',
    uMidArgs: 'atomic',
    uLowArgs: 'atomic',
  },
  workgroupSize: [64, 1, 1],

  compute(
    { uViewProj, uCamera, uHighVisible, uMidVisible, uLowVisible, uHighArgs, uMidArgs, uLowArgs },
    id,
  ) {
    const instance = id.x;
    const column = mod(instance, 400);
    const row = floor(instance / 400);
    const world = vec3((column - 200) * 4, -1, (row - 200) * 4);
    const clip = uViewProj.mul(vec4(world, 1));
    const margin = clip.w * 0.025;
    if (
      clip.w > 0
      && abs(clip.x) <= clip.w + margin
      && abs(clip.y) <= clip.w + margin
      && clip.z >= 0
      && clip.z <= clip.w
    ) {
      const distanceToCamera = length(world.sub(uCamera));
      if (distanceToCamera < 42) {
        const slot = atomicAdd(uHighArgs, 1, 1);
        storageWrite(uHighVisible, slot, instance);
      } else if (distanceToCamera < 125) {
        const slot = atomicAdd(uMidArgs, 1, 1);
        storageWrite(uMidVisible, slot, instance);
      } else {
        const slot = atomicAdd(uLowArgs, 1, 1);
        storageWrite(uLowVisible, slot, instance);
      }
    }
  },
});
