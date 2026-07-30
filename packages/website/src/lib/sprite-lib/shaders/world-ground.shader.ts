import { shader, vec2, vec3, vec4, normalize, dot, max, mix, smoothstep, sin, cos, length } from 'brometal';

/**
 * The stylized ground: a flat XZ grid displaced by `terrainHeight` in the vertex
 * shader, coloured in bands by height and slope.
 *
 * `terrainHeight` here must stay identical to the TypeScript one in
 * `../terrain.ts` — see the note there.
 *
 * The alpha channel carries distance from the camera, not opacity. This pass
 * renders into a float target that the depth-of-field pass samples, and it needs
 * a per-pixel depth to decide how far out of focus each pixel is. Writing it
 * into the spare channel avoids a second pass and a depth-texture read.
 */
function terrainHeight(x: number, z: number): number {
  return (
    1.55 * sin(x * 0.085) * cos(z * 0.075) +
    0.75 * sin(x * 0.17 + 1.7) * cos(z * 0.155 + 0.6) +
    0.35 * sin((x + z) * 0.26 + 2.4)
  );
}

export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: {
    uViewProj: 'mat4',
    uCamPos: 'vec3',
    uLightDir: 'vec3',
    uWaterLevel: 'float',
  },
  varyings: { vNormal: 'vec3', vHeight: 'float', vDepth: 'float', vSlope: 'float' },

  vertex({ aPosition }, { uViewProj, uCamPos }, v) {
    const h = terrainHeight(aPosition.x, aPosition.z);
    const world = vec3(aPosition.x, h, aPosition.z);

    // Normal by central difference. The grid step is ~0.9 units, so a 0.5 epsilon
    // stays inside one cell and the shading follows the mesh rather than
    // averaging across it.
    const e = 0.5;
    const hx0 = terrainHeight(aPosition.x - e, aPosition.z);
    const hx1 = terrainHeight(aPosition.x + e, aPosition.z);
    const hz0 = terrainHeight(aPosition.x, aPosition.z - e);
    const hz1 = terrainHeight(aPosition.x, aPosition.z + e);
    v.vNormal = normalize(vec3(hx0 - hx1, 2 * e, hz0 - hz1));
    v.vSlope = length(vec2(hx1 - hx0, hz1 - hz0)) / (2 * e);
    v.vHeight = h;
    v.vDepth = length(world.sub(uCamPos));
    return uViewProj.mul(vec4(world, 1));
  },

  fragment({ uLightDir, uWaterLevel }, { vNormal, vHeight, vDepth, vSlope }) {
    const normal = normalize(vNormal);
    const diffuse = max(dot(normal, normalize(uLightDir)), 0);
    // A cool bounce from below keeps the shadowed faces from going flat black.
    const ambient = 0.6 + 0.16 * max(-normal.y, 0);

    const sand = vec3(0.79, 0.71, 0.48);
    const grass = vec3(0.29, 0.5, 0.24);
    const grassDry = vec3(0.44, 0.55, 0.26);
    const rock = vec3(0.44, 0.42, 0.42);
    const snow = vec3(0.86, 0.88, 0.9);

    // Shoreline sand fades out just above the waterline.
    const shore = smoothstep(uWaterLevel + 0.55, uWaterLevel - 0.1, vHeight);
    const dry = smoothstep(0.1, 1.3, vHeight);
    const high = smoothstep(1.6, 2.35, vHeight);
    let albedo = mix(grass, grassDry, dry);
    albedo = mix(albedo, snow, high);
    albedo = mix(albedo, sand, shore);
    // Steep faces show rock whatever their height — that is what reads as a cliff.
    albedo = mix(albedo, rock, smoothstep(0.55, 1.15, vSlope));

    return vec4(albedo.scale(ambient + diffuse * 0.62), vDepth);
  },
});
