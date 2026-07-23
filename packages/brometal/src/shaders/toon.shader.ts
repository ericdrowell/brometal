import { shader, vec2, vec3, vec4, sin, cos, sqrt, length, smoothstep } from 'brometal';
import { toonShade, specGGX, fillAA, sdCircle } from 'brometal/shader-functions';

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
    const lightDir = vec3(cos(uTime * 0.8), 0.6, sin(uTime * 0.8));
    let color = vec3(0.09, 0.08, 0.13);
    if (r < 1) {
      const normal = vec3(p.x, p.y, sqrt(1 - r * r));
      const bands = toonShade(normal, lightDir, 3);
      const spec = specGGX(normal, lightDir, vec3(0, 0, 1), 0.35);
      const glint = smoothstep(0.25, 0.3, spec);
      const base = vec3(0.36, 0.65, 0.95);
      color = base.scale(0.25 + bands * 0.75).add(vec3(1, 1, 1).scale(glint * 0.6));
      const outline = smoothstep(0.88, 0.99, r);
      color = color.scale(1 - outline);
    }
    const mask = fillAA(sdCircle(p, 1), 0.012);
    return vec4(color.scale(mask).add(vec3(0.09, 0.08, 0.13).scale(1 - mask)), 1);
  },
});
