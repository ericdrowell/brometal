import { shader, vec2, vec3, vec4, sin, cos, sqrt, length } from 'brometal';
import { lambert, blinnPhongSpec, fresnel, hemisphereLight, fillAA, sdCircle } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5).scale(2.4);
    const r = length(p);
    const lightDir = vec3(cos(uTime), 0.7, sin(uTime));
    const viewDir = vec3(0, 0, 1);
    let color = vec3(0.05, 0.05, 0.08);
    if (r < 1) {
      const normal = vec3(p.x, p.y, sqrt(1 - r * r));
      const ambient = hemisphereLight(normal, vec3(0.22, 0.25, 0.36), vec3(0.1, 0.08, 0.07));
      const diffuse = lambert(normal, lightDir);
      const spec = blinnPhongSpec(normal, lightDir, viewDir, 48);
      const rim = fresnel(normal, viewDir, 3);
      const base = vec3(0.85, 0.35, 0.25);
      color = base.mul(diffuse).add(ambient.mul(base)).add(vec3(1, 1, 1).scale(spec * 0.5)).add(vec3(0.4, 0.5, 1).scale(rim * 0.4));
    }
    const mask = fillAA(sdCircle(p, 1), 0.01);
    return vec4(color.scale(mask).add(vec3(0.05, 0.05, 0.08).scale(1 - mask)), 1);
  },
});
