import { shader, vec2, vec3, vec4, normalize, dot, cross, max, mix, pow, clamp, type Vec2, type Vec3 } from 'brometal';
import { fbm2, fresnel, blinnPhongSpec, gerstnerWave, filmGrain } from 'brometal/shader-functions';

function oceanOffset(p: Vec2, time: number): Vec3 {
  const w1 = gerstnerWave(p, vec2(1, 0.6), 0.18, 5.2, time);
  const w2 = gerstnerWave(p, vec2(-0.7, 1), 0.14, 3.1, time);
  const w3 = gerstnerWave(p, vec2(1, -1.3), 0.1, 1.8, time);
  const w4 = gerstnerWave(p, vec2(-0.4, -0.9), 0.08, 1.1, time);
  return w1.add(w2).add(w3).add(w4);
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uViewProj: 'mat4', uModel: 'mat4', uTime: 'float', uViewPos: 'vec3', uSunDir: 'vec3' },
  varyings: { vNormal: 'vec3', vWorldPos: 'vec3', vUv: 'vec2' },

  vertex({ aPosition, aUv }, { uViewProj, uModel, uTime }, v) {
    const p = aPosition.xy;
    const off = oceanOffset(p, uTime);
    const e = 0.06;
    const px = vec2(p.x + e, p.y);
    const py = vec2(p.x, p.y + e);
    const offX = oceanOffset(px, uTime);
    const offY = oceanOffset(py, uTime);
    const base = vec3(p.x, p.y, 0).add(off);
    const tangentX = vec3(px.x, px.y, 0).add(offX).sub(base);
    const tangentY = vec3(py.x, py.y, 0).add(offY).sub(base);
    const normal = normalize(cross(tangentX, tangentY));
    const world = uModel.mul(vec4(base, 1));
    v.vWorldPos = world.xyz;
    v.vNormal = uModel.mul(vec4(normal, 0)).xyz;
    v.vUv = aUv;
    return uViewProj.mul(world);
  },

  fragment({ uTime, uViewPos, uSunDir }, { vNormal, vWorldPos, vUv }) {
    // Micro-ripples: perturb the wave normal with an fbm gradient.
    const q = vUv.scale(60).add(vec2(uTime * 0.6, uTime * 0.35));
    const e = 0.35;
    const h0 = fbm2(q, 3);
    const hx = fbm2(q.add(vec2(e, 0)), 3);
    const hy = fbm2(q.add(vec2(0, e)), 3);
    const ripple = vec3((h0 - hx) * 1.4, 0, (h0 - hy) * 1.4);
    const n = normalize(normalize(vNormal).add(ripple));

    const viewDir = normalize(uViewPos.sub(vWorldPos));
    const skyColor = vec3(0.09, 0.11, 0.2);
    const deepColor = vec3(0.012, 0.035, 0.06);
    const rim = fresnel(n, viewDir, 5);
    const facing = max(dot(n, viewDir), 0);
    const body = mix(deepColor, vec3(0.03, 0.1, 0.14), facing);
    let color = mix(body, skyColor, clamp(rim * 1.4, 0, 1));

    // Moonlight: a tight glint plus a broad soft sheen along the streak.
    const glint = blinnPhongSpec(n, uSunDir, viewDir, 900);
    const sheen = blinnPhongSpec(n, uSunDir, viewDir, 24);
    const moon = vec3(1, 0.97, 0.88);
    color = color.add(moon.scale(glint * 2.2)).add(moon.scale(sheen * 0.12));

    // Crest lightening from wave height.
    const lift = clamp(vWorldPos.y * 1.3 + 0.15, 0, 1);
    color = color.add(vec3(0.05, 0.09, 0.11).scale(pow(lift, 3)));

    // A whisper of animated grain keeps the dark water from banding.
    color = color.add(vec3(1, 1, 1).scale(filmGrain(vUv, uTime) * 0.04));
    return vec4(color, 1);
  },
});
