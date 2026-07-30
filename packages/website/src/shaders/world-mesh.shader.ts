import { shader, vec3, vec4, normalize, dot, max, length } from 'brometal';

/**
 * Instanced flat-shaded meshes — the trees and rocks. One program per mesh, but
 * one shader for all of them: the geometry carries its own per-vertex colour, so
 * a tree and a boulder differ only in the buffers bound to them.
 *
 * Per instance: a world position, a uniform scale, a yaw and a tint. Yaw alone
 * (rather than a full matrix) is enough for scenery standing on the ground, and
 * it keeps the instance data to nine floats.
 *
 * The yaw arrives as `iScaleRot = (scale, cos(yaw), sin(yaw))` rather than as an
 * angle, because a rotation that is constant across an instance would otherwise
 * be recomputed once per vertex — 261 vertices for a conifer, 408 for a bushy
 * tree. One extra float per instance, uploaded once at startup, buys back two
 * transcendentals on all 139,410 scenery vertices every frame. The grass shader
 * makes the same trade for the same reason and states the arithmetic.
 *
 * Alpha carries camera distance for the depth-of-field pass, as in every world
 * shader here.
 */
export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aColor: 'vec3' },
  instanceAttributes: { iPos: 'vec3', iScaleRot: 'vec3', iTint: 'vec3' },
  uniforms: { uViewProj: 'mat4', uCamPos: 'vec3', uLightDir: 'vec3' },
  varyings: { vNormal: 'vec3', vColor: 'vec3', vDepth: 'float' },

  vertex({ aPosition, aNormal, aColor, iPos, iScaleRot, iTint }, { uViewProj, uCamPos }, v) {
    const s = iScaleRot.x;
    const c = iScaleRot.y;
    const sn = iScaleRot.z;
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
