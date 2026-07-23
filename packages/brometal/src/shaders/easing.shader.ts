import { shader, vec2, vec3, vec4, fract, abs } from 'brometal';
import { easeOutBounce, easeOutElastic, easeInOutCubic, sdCircle, fillAA } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2(vUv.x * uAspect, vUv.y);
    const t = fract(uTime * 0.5);
    const bounceY = 0.15 + easeOutBounce(t) * 0.6;
    const elasticY = 0.15 + easeOutElastic(t) * 0.6;
    const cubicY = 0.15 + easeInOutCubic(t) * 0.6;
    const third = uAspect / 3;
    const b1 = fillAA(sdCircle(p.sub(vec2(third * 0.5, bounceY)), 0.05), 0.005);
    const b2 = fillAA(sdCircle(p.sub(vec2(third * 1.5, elasticY)), 0.05), 0.005);
    const b3 = fillAA(sdCircle(p.sub(vec2(third * 2.5, cubicY)), 0.05), 0.005);
    const color = vec3(0.98, 0.45, 0.2).scale(b1)
      .add(vec3(0.3, 0.82, 0.44).scale(b2))
      .add(vec3(0.55, 0.6, 1).scale(b3));
    return vec4(color, 1);
  },
});
