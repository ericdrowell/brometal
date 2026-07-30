import { shader, vec3, vec4, normalize, dot, max, length, sin } from 'brometal';

/**
 * Instanced grass blades with wind.
 *
 * The bend is quadratic in height — `aPosition.y * aPosition.y` — so the base
 * stays planted and only the tip travels. Bending linearly shears the whole blade
 * and reads as sliding rather than swaying.
 *
 * Each blade's phase comes from its own world position, so a field of them ripples
 * instead of pulsing in unison, with no per-instance phase attribute.
 *
 * ## Why the yaw arrives pre-resolved
 *
 * `iScaleRot` is `(scale, cos(yaw), sin(yaw))`, not `(scale, yaw)`. A blade is 18
 * vertices, and yaw is constant across all of them, but the pipeline has no
 * per-instance stage — so a `cos(yaw)` in here would run 18 times per blade for
 * one answer. 8,847 blades is 159,246 invocations a frame paying for two
 * transcendentals each, forever, to save one float per instance uploaded once.
 * Resolving it on the CPU costs 35 KiB of one-time upload and removes ~318,000
 * sines and cosines per frame. That is the trade that a shader should take; the
 * *reverse* trade — synthesising instance data from a hash of an index to avoid
 * an upload — is the same arithmetic run the wrong way.
 *
 * ## Why there is no distance LOD here
 *
 * There was one, briefly: fade the scale out past 40 ground-plane units, then set
 * the clip position outside the clip volume so the blade never reaches the
 * rasteriser. It is withdrawn, and the reason is worth more than the code was.
 *
 * Clipping happens *after* the vertex shader, so a cull like that cannot save
 * vertex work at all — only triangle setup, rasterisation and fragment shading.
 * Which means it saves nothing on a blade that is off screen, because the
 * hardware already clipped that one for free. Every byte it saves has to come out
 * of blades the viewer can actually see, so the only question is whether they are
 * small enough for their absence to go unnoticed.
 *
 * They are not, and the camera geometry says so without any guessing. This camera
 * sits 11 units above the hero looking down at it, so the visible ground runs out
 * at 47 units up the centre of the frame and 56–63 in the top corners depending
 * on aspect. A blade of scale 1 at 47 units subtends `1/47` radians, which on an
 * 800-pixel-high canvas at this field of view is about 24 pixels tall. To get a
 * blade down to the 2-pixel sliver where a fade really is invisible you would
 * have to be 480 units away — in a world 92 units across. There is no distance in
 * this scene where grass is small; a fade band anywhere inside the frustum is a
 * distance circle cutting a visible crescent across a rectangular frame, thinning
 * the corners while the middle of the same row stays full height. Measured, it
 * bought a 9–12% reduction in grass fragment area for that.
 *
 * The general shape of the lesson: a vertex-shader cull is worth it when the
 * geometry it removes is provably invisible for a reason that does not depend on
 * screen resolution or aspect. `world-water.shader.ts` has that case — 80% of its
 * grid is underneath opaque terrain, and the proof is one inequality about the
 * grid spacing. Grass has no such argument available.
 */
export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aColor: 'vec3' },
  instanceAttributes: { iPos: 'vec3', iScaleRot: 'vec3', iTint: 'vec3' },
  uniforms: {
    uViewProj: 'mat4',
    uCamPos: 'vec3',
    uLightDir: 'vec3',
    uTime: 'float',
    uWind: 'float',
  },
  varyings: { vColor: 'vec3', vDepth: 'float', vShade: 'float' },

  vertex(
    { aPosition, aNormal, aColor, iPos, iScaleRot, iTint },
    { uViewProj, uCamPos, uLightDir, uTime, uWind },
    v,
  ) {
    const phase = uTime * 1.9 + iPos.x * 0.55 + iPos.z * 0.4;
    // These two are per-instance constants as well, but they move with uTime, so
    // unlike the yaw there is nothing to precompute — the CPU would have to
    // re-upload them every frame, which is the cost this demo exists to avoid.
    const gust = sin(phase) * 0.6 + sin(phase * 0.41 + 1.3) * 0.4;
    const bend = gust * uWind * aPosition.y * aPosition.y;

    const c = iScaleRot.y;
    const sn = iScaleRot.z;
    const bent = vec3(aPosition.x + bend, aPosition.y - bend * bend * 0.35, aPosition.z);
    const rotated = vec3(bent.x * c + bent.z * sn, bent.y, bent.z * c - bent.x * sn);
    const world = rotated.scale(iScaleRot.x).add(iPos);

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
