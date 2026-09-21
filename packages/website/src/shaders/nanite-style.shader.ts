import {
  mix,
  floor,
  instanceId,
  mod,
  shader,
  sin,
  storageRead,
  vec3,
  vec4,
} from 'brometal';
import { rotate2 } from 'brometal/shader-functions';

/** Cluster-debug rendering for the Nanite-style distance-LOD field. */
export const NaniteStyle = shader({
  attributes: { aPosition: 'vec3', aClusterColor: 'vec3' },
  uniforms: { uViewProj: 'mat4', uTime: 'float' },
  storage: { uVisible: 'float' },
  varyings: { vColor: 'vec3' },

  vertex(
    { aPosition, aClusterColor },
    { uViewProj, uTime, uVisible },
    v,
  ) {
    const instance = storageRead(uVisible, instanceId());
    const column = mod(instance, 400);
    const row = floor(instance / 400);
    const offset = vec3((column - 200) * 4, -1, (row - 200) * 4);
    const angle = instance + uTime;
    const spun = rotate2(aPosition.xz, angle);
    const local = vec3(spun.x, aPosition.y, spun.y);
    const world = local.add(offset);
    const tint = vec3(
      sin(instance * 0.017 + aClusterColor.x * 17.3) * 0.4 + 0.6,
      sin(instance * 0.023 + aClusterColor.y * 19.7 + 2.1) * 0.4 + 0.6,
      sin(instance * 0.031 + aClusterColor.z * 23.9 + 4.2) * 0.4 + 0.6,
    );
    const varied = mix(aClusterColor, tint, 0.68);
    v.vColor = mix(varied, vec3(1), 0.28);
    return uViewProj.mul(vec4(world, 1));
  },

  fragment(_uniforms, { vColor }) {
    return vec4(vColor, 1);
  },
});
