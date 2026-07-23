import { shader, vec2, vec3, vec4, sin, cos, normalize, max, clamp, mix, type Vec2, type Vec3 } from 'brometal';
import { rotate2, sdSphere3, sdBox3, sdTorus3, smoothUnion, lambert, fresnel, hemisphereLight } from 'brometal/shader-functions';

function scene(q: Vec3, time: number): number {
  const spun = rotate2(q.xz, time * 0.6);
  const box = sdBox3(vec3(spun.x, q.y, spun.y), vec3(0.35, 0.35, 0.35));
  const ball = sdSphere3(q.sub(vec3(cos(time) * 0.7, sin(time * 1.4) * 0.3, sin(time) * 0.4)), 0.3);
  const ring = sdTorus3(vec3(q.x, q.y + 0.45, q.z), vec2(0.7, 0.08));
  return smoothUnion(smoothUnion(box, ball, 0.25), ring, 0.2);
}

function sceneNormal(q: Vec3, time: number): Vec3 {
  const e = 0.002;
  const dx = scene(q.add(vec3(e, 0, 0)), time) - scene(q.sub(vec3(e, 0, 0)), time);
  const dy = scene(q.add(vec3(0, e, 0)), time) - scene(q.sub(vec3(0, e, 0)), time);
  const dz = scene(q.add(vec3(0, 0, e)), time) - scene(q.sub(vec3(0, 0, e)), time);
  return normalize(vec3(dx, dy, dz));
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
    const ro = vec3(0, 0.4, 2.4);
    const rd = normalize(vec3(p.x, p.y - 0.15, -1.4));
    let t = 0;
    for (let i = 0; i < 72; i += 1) {
      const d = scene(ro.add(rd.scale(t)), uTime);
      t += clamp(d, 0.001, 0.35);
    }
    const hit = ro.add(rd.scale(t));
    let color = mix(vec3(0.06, 0.06, 0.1), vec3(0.12, 0.1, 0.18), vUv.y);
    if (scene(hit, uTime) < 0.01) {
      const n = sceneNormal(hit, uTime);
      const lightDir = vec3(0.6, 0.8, 0.4);
      const diffuse = lambert(n, lightDir);
      const ambient = hemisphereLight(n, vec3(0.25, 0.28, 0.4), vec3(0.12, 0.09, 0.08));
      const rim = fresnel(n, vec3(0, 0, 1), 3);
      const base = vec3(0.9, 0.5, 0.25);
      color = base.mul(diffuse).add(ambient.mul(base)).add(vec3(0.5, 0.6, 1).scale(rim * 0.5));
    }
    return vec4(color, 1);
  },
});
