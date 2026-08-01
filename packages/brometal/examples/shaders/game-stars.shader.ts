import { shader, vec3, vec4, mod, clamp } from 'brometal';

// Star streaks: unit cubes stretched into thin lines along z, wrapped through
// a deep tube like the asteroids but much faster — the classic warp tunnel.
export default shader({
  attributes: { aPosition: 'vec3' },
  instanceAttributes: { iOffset: 'vec3', iLen: 'float', iSeed: 'float' },
  uniforms: { uViewProj: 'mat4', uScroll: 'float', uWrap: 'float', uAhead: 'float', uColor: 'vec3' },
  varyings: { vAlpha: 'float' },

  vertex({ aPosition, iOffset, iLen, iSeed }, { uViewProj, uScroll, uWrap, uAhead }, v) {
    // Per-star speed so the tunnel has parallax within itself.
    const z = mod(iOffset.z + uScroll * (0.7 + iSeed * 0.6), uWrap) - uWrap + uAhead;
    const local = vec3(aPosition.x * 0.035, aPosition.y * 0.035, aPosition.z * iLen);
    const world = local.add(vec3(iOffset.x, iOffset.y, z));
    // Dim in the far distance, full strength as they whip past.
    const closeness = clamp((z + uWrap - uAhead) / uWrap, 0, 1);
    v.vAlpha = (0.15 + closeness * 0.85) * (0.4 + iSeed * 0.6);
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uColor }, { vAlpha }) {
    return vec4(uColor, vAlpha);
  },
});
