import { shader, vec2, vec3, vec4, sin, cos, distance, smoothstep, pow } from 'brometal';
import { cosinePalette } from 'brometal/shader-functions';

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
    const b1 = vec2(cos(uTime) * 0.25, sin(uTime * 1.3) * 0.2);
    const b2 = vec2(cos(uTime * 0.7 + 2) * 0.3, sin(uTime * 0.9 + 1) * 0.22);
    const b3 = vec2(cos(uTime * 1.5 + 4) * 0.2, sin(uTime * 0.6 + 3) * 0.26);
    let field = 0;
    field += 0.012 / (distance(p, b1) * distance(p, b1) + 0.001);
    field += 0.012 / (distance(p, b2) * distance(p, b2) + 0.001);
    field += 0.012 / (distance(p, b3) * distance(p, b3) + 0.001);
    const body = smoothstep(0.9, 1.1, field);
    const glow = pow(smoothstep(0.3, 1.1, field), 3) * 0.6;
    const color = cosinePalette(field * 0.2 + uTime * 0.05, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1, 1, 1), vec3(0.3, 0.2, 0.2));
    return vec4(color.scale(body).add(color.scale(glow)), 1);
  },
});
