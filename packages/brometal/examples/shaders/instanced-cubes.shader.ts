import {
  clamp,
  cross,
  dot,
  max,
  mix,
  normalize,
  pow,
  shader,
  sin,
  vec3,
  vec4,
} from 'brometal';
import { blinnPhongSpec, rotate2 } from 'brometal/shader-functions';

/** One cube mesh becomes a luminous kinetic sculpture in one draw call. */
export const InstancedCubes = shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  instanceAttributes: {
    iOffset: 'vec3',
    iNormal: 'vec3',
    iTangent: 'vec3',
    iPhase: 'float',
    iScale: 'vec3',
    iTint: 'vec3',
  },
  uniforms: { uViewProj: 'mat4', uViewPos: 'vec3', uTime: 'float' },
  varyings: {
    vColor: 'vec3',
    vNormal: 'vec3',
    vWorld: 'vec3',
    vPulse: 'float',
  },

  vertex(
    { aPosition, aNormal, iOffset, iNormal, iTangent, iPhase, iScale, iTint },
    { uViewProj, uTime },
    v,
  ) {
    const bitangent = normalize(cross(iNormal, iTangent));
    const spin = iPhase * 6.2831853 + uTime * (0.2 + iPhase * 0.35);
    const local = aPosition.mul(iScale);
    const spun = rotate2(local.xz, spin);
    const wave = sin(iPhase * 37 + uTime * 2.1) * 0.65
      + sin(iPhase * 91 - uTime * 1.3) * 0.22;
    const world = iOffset
      .add(iTangent.scale(spun.x))
      .add(iNormal.scale(local.y + wave))
      .add(bitangent.scale(spun.y));

    const normalSpun = rotate2(aNormal.xz, spin);
    v.vNormal = normalize(
      iTangent.scale(normalSpun.x)
        .add(iNormal.scale(aNormal.y))
        .add(bitangent.scale(normalSpun.y)),
    );
    v.vWorld = world;
    v.vColor = iTint;
    v.vPulse = sin(iPhase * 58 - uTime * 2.6) * 0.5 + 0.5;
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uViewPos }, { vColor, vNormal, vWorld, vPulse }) {
    const n = normalize(vNormal);
    const light = normalize(vec3(-0.35, 0.75, 0.55));
    const view = normalize(uViewPos.sub(vWorld));
    const diffuse = max(dot(n, light), 0);
    const rim = pow(1 - clamp(dot(n, view), 0, 1), 2.4);
    const specular = blinnPhongSpec(n, light, view, 40);
    const lit = vColor.scale(0.12 + diffuse * 1.15 + vPulse * 0.16);
    const edge = mix(vec3(0.18, 0.32, 1.1), vec3(1.35, 0.42, 0.95), vPulse);
    const color = lit.add(edge.scale(rim * 0.7)).add(vec3(1, 0.82, 0.62).scale(specular * 0.75));
    return vec4(color, 1);
  },
});
