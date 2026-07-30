import { shader, vec3, vec4, normalize, dot, max, length, sin, cos } from 'brometal';

/**
 * Instanced flat-shaded meshes — the trees and rocks. One program per mesh, but
 * one shader for all of them: the geometry carries its own per-vertex colour, so
 * a tree and a boulder differ only in the buffers bound to them.
 *
 * Per instance: a world position, a uniform scale and a yaw, and a tint. Yaw
 * alone (rather than a full matrix) is enough for scenery standing on the ground,
 * and it keeps the instance data at eight floats.
 *
 * Alpha carries camera distance for the depth-of-field pass, as in every world
 * shader here.
 */
export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aColor: 'vec3' },
  instanceAttributes: { iPos: 'vec3', iScaleYaw: 'vec2', iTint: 'vec3' },
  uniforms: { uViewProj: 'mat4', uCamPos: 'vec3', uLightDir: 'vec3' },
  varyings: { vNormal: 'vec3', vColor: 'vec3', vDepth: 'float' },

  vertex({ aPosition, aNormal, aColor, iPos, iScaleYaw, iTint }, { uViewProj, uCamPos }, v) {
    const s = iScaleYaw.x;
    const c = cos(iScaleYaw.y);
    const sn = sin(iScaleYaw.y);
    // Yaw about Y, then uniform scale, then translate.
    const rotated = vec3(
      aPosition.x * c + aPosition.z * sn,
      aPosition.y,
      aPosition.z * c - aPosition.x * sn,
    );
    const world = rotated.scale(s).add(iPos);
    // A uniform scale does not skew normals, so the same rotation is enough.
    v.vNormal = vec3(
      aNormal.x * c + aNormal.z * sn,
      aNormal.y,
      aNormal.z * c - aNormal.x * sn,
    );
    v.vColor = aColor.mul(iTint);
    v.vDepth = length(world.sub(uCamPos));
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uLightDir }, { vNormal, vColor, vDepth }) {
    const normal = normalize(vNormal);
    const diffuse = max(dot(normal, normalize(uLightDir)), 0);
    // Wrapped lighting: the terminator softens instead of clipping to black,
    // which is what keeps flat-shaded facets looking stylized rather than unlit.
    const wrapped = max(dot(normal, normalize(uLightDir)) * 0.5 + 0.5, 0);
    const shade = 0.34 + wrapped * 0.5 + diffuse * 0.3;
    return vec4(vColor.scale(shade), vDepth);
  },
});
