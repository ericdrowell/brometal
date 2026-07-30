import { shader, vec3, vec4, normalize, dot, max, length, sin, cos } from 'brometal';

/**
 * Instanced grass blades with wind.
 *
 * The bend is quadratic in height — `aPosition.y * aPosition.y` — so the base
 * stays planted and only the tip travels. Bending linearly shears the whole blade
 * and reads as sliding rather than swaying.
 *
 * Each blade's phase comes from its own world position, so a field of them ripples
 * instead of pulsing in unison, with no per-instance phase attribute.
 */
export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aColor: 'vec3' },
  instanceAttributes: { iPos: 'vec3', iScaleYaw: 'vec2', iTint: 'vec3' },
  uniforms: { uViewProj: 'mat4', uCamPos: 'vec3', uLightDir: 'vec3', uTime: 'float', uWind: 'float' },
  varyings: { vColor: 'vec3', vDepth: 'float', vShade: 'float' },

  vertex(
    { aPosition, aNormal, aColor, iPos, iScaleYaw, iTint },
    { uViewProj, uCamPos, uLightDir, uTime, uWind },
    v,
  ) {
    const phase = uTime * 1.9 + iPos.x * 0.55 + iPos.z * 0.4;
    const gust = sin(phase) * 0.6 + sin(phase * 0.41 + 1.3) * 0.4;
    const bend = gust * uWind * aPosition.y * aPosition.y;

    const c = cos(iScaleYaw.y);
    const sn = sin(iScaleYaw.y);
    const bent = vec3(aPosition.x + bend, aPosition.y - bend * bend * 0.35, aPosition.z);
    const rotated = vec3(bent.x * c + bent.z * sn, bent.y, bent.z * c - bent.x * sn);
    const world = rotated.scale(iScaleYaw.x).add(iPos);

    const normal = normalize(vec3(aNormal.x * c + aNormal.z * sn, aNormal.y, aNormal.z * c - aNormal.x * sn));
    // Lit in the vertex stage: a blade is a handful of pixels, so per-pixel
    // lighting on it is wasted work.
    v.vShade = 0.45 + max(dot(normal, normalize(uLightDir)), 0) * 0.55;
    v.vColor = aColor.mul(iTint);
    v.vDepth = length(world.sub(uCamPos));
    return uViewProj.mul(vec4(world, 1));
  },

  fragment(_uniforms, { vColor, vDepth, vShade }) {
    return vec4(vColor.scale(vShade), vDepth);
  },
});
