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
  type Vec3,
} from 'brometal';

/**
 * The stylized ground: a flat XZ grid displaced by the terrain height in the
 * vertex shader, coloured in bands by height and slope.
 *
 * `terrainField` here must stay identical to `terrainHeight` / `terrainSlope` in
 * `../terrain.ts` — see the note there.
 *
 * The alpha channel carries distance from the camera, not opacity. This pass
 * renders into a float target that the depth-of-field pass samples, and it needs
 * a per-pixel depth to decide how far out of focus each pixel is. Writing it
 * into the spare channel avoids a second pass and a depth-texture read.
 */

/**
 * Height **and its exact gradient** in one call: `vec3(h, dh/dx, dh/dz)`.
 *
 * Fused deliberately. The obvious way to get a normal off a height field is a
 * central difference, and that is what this shader used to do: five
 * `terrainHeight` calls, twenty-five sines and cosines, per vertex. But every
 * derivative of a sine is a cosine of the *same argument*, so differentiating by
 * hand and returning both at once needs only `sin` and `cos` of the four
 * arguments plus the diagonal term — five sines and five cosines, ten
 * transcendentals instead of twenty-five, for an answer that is exact rather
 * than approximate.
 *
 * The one-helper shape is the load-bearing part. Two helpers (`terrainHeight`
 * and `terrainGradient`) would recompute all eight of the shared sines, and the
 * DSL compiler folds constants but does not eliminate common subexpressions
 * across function calls.
 */
function terrainField(x: number, z: number): Vec3 {
  const sinAx = sin(x * 0.085);
  const cosAx = cos(x * 0.085);
  const sinAz = sin(z * 0.075);
  const cosAz = cos(z * 0.075);
  const sinBx = sin(x * 0.17 + 1.7);
  const cosBx = cos(x * 0.17 + 1.7);
  const sinBz = sin(z * 0.155 + 0.6);
  const cosBz = cos(z * 0.155 + 0.6);
  const sinC = sin((x + z) * 0.26 + 2.4);
  const cosC = cos((x + z) * 0.26 + 2.4);
  return vec3(
    1.55 * sinAx * cosAz + 0.75 * sinBx * cosBz + 0.35 * sinC,
    1.55 * 0.085 * cosAx * cosAz + 0.75 * 0.17 * cosBx * cosBz + 0.35 * 0.26 * cosC,
    -1.55 * 0.075 * sinAx * sinAz - 0.75 * 0.155 * sinBx * sinBz + 0.35 * 0.26 * cosC,
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
    const field = terrainField(aPosition.x, aPosition.z);
    const world = vec3(aPosition.x, field.x, aPosition.z);

    // The surface normal of y = h(x, z) is (-dh/dx, 1, -dh/dz), unnormalised.
    v.vNormal = normalize(vec3(-field.y, 1, -field.z));
    v.vSlope = length(vec2(field.y, field.z));
    v.vHeight = field.x;
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

    // There used to be a fifth band here: snow, on `smoothstep(1.6, 2.35,
    // vHeight)`. It is gone rather than retuned. The field's realised maximum is
    // 1.761 — the three sine terms never line up, so the 2.65 the amplitudes
    // suggest is unreachable — which made the old band peak at 0.119 and paint
    // nothing. But there is nowhere to move it to either: `dry` already
    // saturates at 1.3, and even a 1.5–1.7 band would only fully cover 0.18% of
    // the land, a dozen square units of specks on ridge tops. A band needs a
    // range to live in; height does not have one left, where slope does.
    // Ascending edges, then inverted. GLSL leaves smoothstep undefined when
    // edge0 >= edge1, so a descending pair is not portable. The two forms are
    // exactly equal: 1 - S(t) == S(1 - t) for S(t) = t * t * (3 - 2 * t).
    const shore = 1 - smoothstep(uWaterLevel - 0.1, uWaterLevel + 0.55, vHeight);
    const dry = smoothstep(0.1, 1.3, vHeight);
    let albedo = mix(grass, grassDry, dry);
    // Steep faces show rock whatever their height — that is what reads as a
    // cliff. 0.22–0.29 is chosen against the measured field rather than by eye:
    // the closed-form gradient bounds |∇h| at 0.31427, so a band has to end
    // below that or it can never saturate. This one is fully rock on the
    // steepest 1.4% of the land and tinted on 8%. The band this replaced
    // (0.55–1.15) was a per-pixel smoothstep and mix that were provably always
    // zero; a first pass at fixing it used 0.24–0.32, which fired but still
    // could not reach 1. Having the derivative in closed form is what makes any
    // of that checkable instead of a guess.
    albedo = mix(albedo, rock, smoothstep(0.22, 0.29, vSlope));
    // Sand goes on last so the beach stays a beach. Mixing rock afterwards
    // turned the steep parts of the waterline grey — 5.5% of the sand-dominant
    // area — which is not what a shoreline does.
    albedo = mix(albedo, sand, shore);

    return vec4(albedo.scale(ambient + diffuse * 0.62), vDepth);
  },
});
