import {
  shader,
  vec2,
  vec3,
  vec4,
  normalize,
  dot,
  max,
  mix,
  smoothstep,
  sin,
  cos,
  length,
  pow,
  reflect,
} from 'brometal';

/**
 * Stylized water: a flat grid at the waterline with two crossing wave trains,
 * coloured by how deep the ground is beneath it.
 *
 * Because the shader can evaluate `terrainHeight` itself, it knows the bed depth
 * at every pixel — which is what gives the shallows their colour ramp and puts a
 * foam line exactly on the shore, with no shoreline geometry and nothing
 * precomputed.
 *
 * Kept opaque rather than blended: this pass writes camera distance into alpha
 * for the depth-of-field pass, so the channel is not available for coverage.
 * Shallow water reads as translucent through colour alone.
 */
function terrainHeight(x: number, z: number): number {
  return (
    1.55 * sin(x * 0.085) * cos(z * 0.075) +
    0.75 * sin(x * 0.17 + 1.7) * cos(z * 0.155 + 0.6) +
    0.35 * sin((x + z) * 0.26 + 2.4)
  );
}

/** Sum of two crossing swells, in the -1..1 range. */
function waveHeight(x: number, z: number, t: number): number {
  return (
    sin(x * 0.55 + t * 1.15) * 0.55 +
    sin(z * 0.42 - t * 0.85) * 0.3 +
    sin((x + z) * 0.9 + t * 1.9) * 0.15
  );
}

export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: {
    uViewProj: 'mat4',
    uCamPos: 'vec3',
    uLightDir: 'vec3',
    uTime: 'float',
    uWaterLevel: 'float',
  },
  varyings: { vWorld: 'vec3', vDepth: 'float', vBed: 'float', vWave: 'float' },

  vertex({ aPosition }, { uViewProj, uCamPos, uTime, uWaterLevel }, v) {
    const wave = waveHeight(aPosition.x, aPosition.z, uTime);
    const world = vec3(aPosition.x, uWaterLevel + wave * 0.055, aPosition.z);
    v.vWorld = world;
    v.vWave = wave;
    v.vBed = uWaterLevel - terrainHeight(aPosition.x, aPosition.z);
    v.vDepth = length(world.sub(uCamPos));
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uCamPos, uLightDir, uTime, uWaterLevel }, { vWorld, vDepth, vBed, vWave }) {
    // Ripple normal from the analytic slope of the same wave sum.
    const e = 0.35;
    const dx =
      waveHeight(vWorld.x + e, vWorld.z, uTime) - waveHeight(vWorld.x - e, vWorld.z, uTime);
    const dz =
      waveHeight(vWorld.x, vWorld.z + e, uTime) - waveHeight(vWorld.x, vWorld.z - e, uTime);
    const normal = normalize(vec3(-dx * 0.22, 1, -dz * 0.22));

    const shallow = vec3(0.42, 0.75, 0.72);
    const deep = vec3(0.07, 0.24, 0.42);
    const body = mix(shallow, deep, smoothstep(0.05, 2.6, vBed));

    const view = normalize(uCamPos.sub(vWorld));
    const light = normalize(uLightDir);
    // Fresnel brightens the water toward grazing angles; the specular gives the
    // swells a moving highlight so the surface reads as wet rather than painted.
    const fresnel = pow(1 - max(dot(normal, view), 0), 3);
    const spec = pow(max(dot(reflect(light.scale(-1), normal), view), 0), 48);
    const sky = vec3(0.62, 0.79, 0.9);

    let color = mix(body, sky, fresnel * 0.6);
    color = color.add(vec3(1, 0.98, 0.9).scale(spec * 0.55));

    // Foam where the bed nearly reaches the surface, plus a little on the crests.
    const shoreFoam = smoothstep(0.34, 0.02, vBed);
    const crestFoam = smoothstep(0.72, 0.98, vWave) * 0.35;
    color = mix(color, vec3(0.93, 0.97, 0.98), max(shoreFoam, crestFoam));

    // Where the ground rises above the waterline the water grid sits *below* it,
    // so the depth test hides it — no coverage test needed here.
    return vec4(color, vDepth);
  },
});
