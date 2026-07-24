import { shader, vec3, vec4, normalize, dot, max, mod } from 'brometal';
import { rotate2, hash11 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  instanceAttributes: { iOffset: 'vec3', iScale: 'float', iSeed: 'float' },
  uniforms: {
    uViewProj: 'mat4',
    uScroll: 'float',
    uWrap: 'float',
    uAhead: 'float',
    uLightDir: 'vec3',
    uTime: 'float',
  },
  varyings: { vNormal: 'vec3', vTint: 'float' },

  vertex({ aPosition, aNormal, iOffset, iScale, iSeed }, { uViewProj, uScroll, uWrap, uAhead, uTime }, v) {
    const spin = uTime * (0.2 + iSeed * 0.8);
    const pr = rotate2(aPosition.xz, spin);
    const nr = rotate2(aNormal.xz, spin);
    const local = vec3(pr.x, aPosition.y, pr.y).scale(iScale);
    const z = mod(iOffset.z + uScroll, uWrap) - uWrap + uAhead;
    const world = local.add(vec3(iOffset.x, iOffset.y, z));
    v.vNormal = vec3(nr.x, aNormal.y, nr.y);
    v.vTint = 0.6 + hash11(iSeed * 91.7) * 0.4;
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uLightDir }, { vNormal, vTint }) {
    const n = normalize(vNormal);
    const diffuse = max(dot(n, normalize(uLightDir)), 0);
    const base = vec3(0.6, 0.5, 0.44).scale(vTint);
    return vec4(base.scale(0.25 + diffuse * 0.85), 1);
  },
});
