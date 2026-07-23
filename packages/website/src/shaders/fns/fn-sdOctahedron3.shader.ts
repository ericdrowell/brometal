import { shader, vec2, vec3, vec4, sin, cos, normalize, clamp, min, type Vec3 } from 'brometal';
import { sdOctahedron3, rotate2, lambert, fresnel } from 'brometal/shader-functions';

function scene(q: Vec3, time: number): number {
  const r = rotate2(q.xz, time * 0.7);
  return sdOctahedron3(vec3(r.x, q.y, r.y), 0.62);
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
    const ro = vec3(0, 0.3, 2.2);
    const rd = normalize(vec3(p.x, p.y - 0.1, -1.3));
    let t = 0;
    for (let i = 0; i < 64; i += 1) {
      t += clamp(scene(ro.add(rd.scale(t)), uTime), 0.001, 0.3);
    }
    const hit = ro.add(rd.scale(t));
    let color = vec3(0.07, 0.07, 0.11);
    if (scene(hit, uTime) < 0.01) {
      const e = 0.002;
      const n = normalize(vec3(
        scene(hit.add(vec3(e, 0, 0)), uTime) - scene(hit.sub(vec3(e, 0, 0)), uTime),
        scene(hit.add(vec3(0, e, 0)), uTime) - scene(hit.sub(vec3(0, e, 0)), uTime),
        scene(hit.add(vec3(0, 0, e)), uTime) - scene(hit.sub(vec3(0, 0, e)), uTime),
      ));
      const diffuse = lambert(n, vec3(0.6, 0.8, 0.4));
      const rim = fresnel(n, vec3(0, 0, 1), 3);
      color = vec3(0.85, 0.5, 0.3).scale(0.2 + diffuse * 0.8).add(vec3(0.5, 0.6, 1).scale(rim * 0.4));
    }
    return vec4(color, 1);
  },
});
