import { shader, vec3, vec4, normalize, cross, dot, clamp, mix, pow } from 'brometal';

// Laser bolts: spheres stretched along their flight direction, animated
// entirely on the GPU from a birth timestamp. Glow comes from view-facing
// falloff — the tube's center faces the camera (white-hot core), the edges
// graze it (blue halo) — the standard energy-bolt trick.
export default shader({
  attributes: { aPosition: 'vec3' },
  instanceAttributes: { iStart: 'vec3', iDir: 'vec3', iBirth: 'float' },
  uniforms: { uViewProj: 'mat4', uTime: 'float', uViewPos: 'vec3' },
  varyings: { vFacing: 'float', vAlong: 'float', vFade: 'float' },

  vertex({ aPosition, iStart, iDir, iBirth }, { uViewProj, uTime, uViewPos }, v) {
    const age = uTime - iBirth;
    const life = 1.1;
    const alive = clamp(age * 60, 0, 1) * clamp((life - age) * 4, 0, 1);
    const f = normalize(iDir);
    // (rgt, up, f) must stay right-handed — a flipped basis mirrors the
    // winding order and backface culling removes the whole bolt.
    const rgt = normalize(cross(f, vec3(0, 1, 0)));
    const up = cross(f, rgt);
    const width = 0.18 * alive;
    const local = rgt
      .scale(aPosition.x * width)
      .add(up.scale(aPosition.y * width))
      .add(f.scale(aPosition.z * 1.7));
    const center = iStart.add(f.scale(age * 55));
    const world = center.add(local);
    // Normal of the stretched sphere: the z component shrinks by the
    // stretch ratio, pushing normals sideways like a real tube.
    const n = normalize(rgt.scale(aPosition.x).add(up.scale(aPosition.y)).add(f.scale(aPosition.z * 0.1)));
    v.vFacing = clamp(dot(n, normalize(uViewPos.sub(world))), 0, 1);
    v.vAlong = aPosition.z * 0.5 + 0.5;
    v.vFade = alive;
    return uViewProj.mul(vec4(world, 1));
  },

  fragment(_u, { vFacing, vAlong, vFade }) {
    const core = pow(vFacing, 3);
    const halo = pow(vFacing, 1.3) * 0.9;
    const color = mix(vec3(0.3, 0.55, 1), vec3(1, 1, 1), core);
    return vec4(color, (core * 1.3 + halo) * (0.65 + vAlong * 0.35) * vFade);
  },
});
