import {
  shader,
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
  type Vec3,
} from 'brometal';

/**
 * Stylized water: a flat grid at the waterline with two crossing wave trains,
 * coloured by how deep the ground is beneath it.
 *
 * Because the shader can evaluate `terrainHeight` itself, it knows the bed depth
 * at every pixel — which is what gives the shallows their colour ramp and puts a
 * foam line exactly on the shore, with no shoreline geometry and nothing
 * precomputed. The same number pays for itself twice: the vertex shader uses it
 * to drop the four fifths of the grid that is buried under dry land.
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

/**
 * Surface normal of the same wave sum, differentiated analytically.
 *
 * This runs per pixel over every water fragment, which is why it is worth
 * getting right. A central difference costs four `waveHeight` calls — twelve
 * sines — and is still only an approximation; the derivative of a sine is a
 * cosine of the same argument, so the exact slope is three cosines. Same
 * arithmetic everywhere else, a quarter of the transcendentals, on the pass that
 * covers the most pixels. `brocraft-water.shader.ts` makes the same trade for
 * the same reason.
 *
 * The 0.154 is `2 * 0.35 * 0.22`: the old code differenced at e = 0.35 and never
 * divided by 2e, so its slope carried an extra factor of 0.7. Folding it in here
 * matches the old ripple strength to within about 1.6%, not exactly — a central
 * difference at spacing e also attenuates each term by sinc(k·e), which is
 * 0.9835 on the k = 0.9 diagonal train and 0.994–0.996 on the others. The exact
 * derivative has no such damping, so the diagonal component is very slightly
 * steeper than before. It is the approximation that was wrong, and 1.6% of a
 * ripple slope is not visible.
 */
function waveNormal(x: number, z: number, t: number): Vec3 {
  const cosA = cos(x * 0.55 + t * 1.15);
  const cosB = cos(z * 0.42 - t * 0.85);
  const cosC = cos((x + z) * 0.9 + t * 1.9);
  const gx = 0.55 * 0.55 * cosA + 0.15 * 0.9 * cosC;
  const gz = 0.3 * 0.42 * cosB + 0.15 * 0.9 * cosC;
  return normalize(vec3(-gx * 0.154, 1, -gz * 0.154));
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
    const bed = uWaterLevel - terrainHeight(aPosition.x, aPosition.z);
    v.vWorld = world;
    v.vWave = wave;
    v.vBed = bed;
    v.vDepth = length(world.sub(uCamPos));

    let clip = uViewProj.mul(vec4(world, 1));
    // Only 9.4% of this world is under water, but the water grid covers all of
    // it — so four fifths of these triangles are buried under the terrain and
    // are only ever thrown away by the depth test. `bed` is already here for the
    // shading, so throwing them away in the vertex shader instead is free, and
    // it is provably free of holes rather than approximately safe:
    //
    // - The ground and the water are the SAME grid, so over any one triangle
    //   both surfaces are linear. If the ground is above the water at all three
    //   corners it is above it everywhere inside — no need to bound the field's
    //   curvature, the tessellation does it.
    // - Degenerate clip kills a triangle if *any* of its vertices asks for it,
    //   so the per-vertex test has to imply the all-three-corners condition.
    //   Hence the margin: a cell diagonal is 1.355 units and |∇h| ≤ 0.31427, so
    //   the ground can drop at most 0.426 between neighbours, and the water
    //   surface rides at most 0.055 above uWaterLevel. 0.426 + 0.055 = 0.481,
    //   rounded to 0.5. Checked over the real grid: 80.0% of the 18,432
    //   triangles cull, and the tightest surviving case still clears the highest
    //   possible water surface by 0.117 units.
    //
    // This is what a vertex-shader cull looks like when it is worth doing. The
    // grass shader has the counter-example.
    if (bed < -0.5) {
      clip = vec4(2, 2, 2, 1);
    }
    return clip;
  },

  fragment({ uCamPos, uLightDir, uTime, uWaterLevel }, { vWorld, vDepth, vBed, vWave }) {
    const normal = waveNormal(vWorld.x, vWorld.z, uTime);

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
    // Inverted ascending edges, for the reason world-ground.shader.ts gives at
    // its own shore mask: descending edges are undefined in GLSL.
    const shoreFoam = 1 - smoothstep(0.02, 0.34, vBed);
    const crestFoam = smoothstep(0.72, 0.98, vWave) * 0.35;
    color = mix(color, vec3(0.93, 0.97, 0.98), max(shoreFoam, crestFoam));

    // Where the ground rises above the waterline the water grid sits *below* it,
    // so the depth test hides it — no coverage test needed here.
    return vec4(color, vDepth);
  },
});
