import { shader, vec2, vec3, vec4, sin, cos, abs } from 'brometal';
import { sdCircle, sdBox2, smoothUnion, fillAA } from 'brometal/shader-functions';

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
    const orbit = vec2(cos(uTime) * 0.22, sin(uTime * 1.3) * 0.18);
    const circle = sdCircle(p.sub(orbit), 0.12);
    const box = sdBox2(p, vec2(0.16, 0.16));
    const d = smoothUnion(circle, box, 0.09);
    const fill = fillAA(d, 0.006);
    const edge = fillAA(abs(d) - 0.004, 0.004);
    const body = vec3(0.98, 0.45, 0.2).scale(fill);
    return vec4(body.add(vec3(1, 0.9, 0.6).scale(edge * 0.6)), 1);
  },
});
