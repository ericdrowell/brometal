import {
  shader,
  vec2,
  vec3,
  vec4,
  normalize,
  dot,
  max,
  mix,
  pow,
  clamp,
  smoothstep,
  type Vec2,
  type Vec3,
} from 'brometal';
import { fbm2 } from 'brometal/shader-functions';

// The sky gradient, shared verbatim with the block and water shaders so the
// fog they blend into is *exactly* the sky behind them — distant terrain
// dissolves into the horizon with no visible seam.
function skyColor(dir: Vec3, sunDir: Vec3, horizon: Vec3, zenith: Vec3, sun: Vec3): Vec3 {
  const d = normalize(dir);
  const lift = pow(clamp(d.y, 0, 1), 0.42);
  let col = mix(horizon, zenith, lift);
  // Below the horizon the haze deepens slightly instead of gradient-banding.
  col = mix(col, horizon.scale(0.82), clamp(-d.y * 3, 0, 1));
  const toSun = max(dot(d, normalize(sunDir)), 0);
  // Broad forward scatter around the sun, then a tight bloom near the disc.
  col = col.add(sun.scale(pow(toSun, 6) * 0.22));
  col = col.add(sun.scale(pow(toSun, 250) * 0.9));
  return col;
}

export const BrocraftSky = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: {
    uRight: 'vec3',
    uUp: 'vec3',
    uForward: 'vec3',
    uCamPos: 'vec3',
    uSunDir: 'vec3',
    uHorizon: 'vec3',
    uZenith: 'vec3',
    uSunColor: 'vec3',
    uTime: 'float',
    uTanFov: 'float',
    uAspect: 'float',
  },
  varyings: { vDir: 'vec3' },

  vertex({ aPosition, aUv }, { uRight, uUp, uForward, uTanFov, uAspect }, v) {
    // Rebuild the camera ray from the basis vectors — cheaper than inverting
    // the view-projection, and the quad is drawn straight in clip space.
    const ndc = aUv.scale(2).sub(vec2(1, 1));
    v.vDir = uForward.add(uRight.scale(ndc.x * uTanFov * uAspect)).add(uUp.scale(ndc.y * uTanFov));
    // z just shy of the far plane: the sky fills every pixel nothing else covers.
    return vec4(aPosition.x, aPosition.y, 0.99999, 1);
  },

  fragment(
    { uCamPos, uSunDir, uHorizon, uZenith, uSunColor, uTime },
    { vDir },
  ) {
    const dir = normalize(vDir);
    let col = skyColor(dir, uSunDir, uHorizon, uZenith, uSunColor);

    // The sun disc itself — sharp enough to read as a body, not a smear.
    const toSun = max(dot(dir, normalize(uSunDir)), 0);
    col = col.add(uSunColor.scale(smoothstep(0.9985, 0.9993, toSun) * 3.5));

    // Clouds: the ray is intersected with a flat deck 220 blocks up, so they
    // sit at a real altitude and stretch out toward the horizon.
    const above = smoothstep(0.02, 0.14, dir.y);
    const t = 220 / max(dir.y, 0.02);
    const p = vec2(uCamPos.x + dir.x * t, uCamPos.z + dir.z * t).scale(0.0012);
    const drift = vec2(uTime * 0.004, uTime * 0.0016);
    const shape = fbm2(p.add(drift), 4);
    const cover = smoothstep(0.52, 0.78, shape);
    // A second, offset sample fakes self-shadowing on the cloud underside.
    const light = smoothstep(0.5, 0.8, fbm2(p.add(drift).add(vec2(0.02, 0.012)), 3));
    const body = mix(uHorizon.scale(0.72), vec3(1.06, 1.04, 1.02), clamp(light * 1.3, 0, 1));
    col = mix(col, body.mul(mix(vec3(0.75, 0.78, 0.85), uSunColor, 0.5)), cover * above * 0.92);

    return vec4(col, 1);
  },
});
