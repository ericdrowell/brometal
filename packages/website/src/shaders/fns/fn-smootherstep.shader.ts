import { shader, vec2, vec3, vec4, abs, clamp, smoothstep, mix } from 'brometal';
import { smootherstep } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const mx = (vUv.x - 0.1) / 0.8;
    const my = (vUv.y - 0.2) / 0.6;
    let color = vec3(0.08, 0.08, 0.12);
    if (mx >= 0 && mx <= 1) {
      const quintic = smootherstep(0, 1, clamp(mx, 0, 1));
      const cubic = smoothstep(0, 1, clamp(mx, 0, 1));
      color = mix(color, vec3(0.4, 0.45, 0.6), 1 - smoothstep(0.008, 0.024, abs(my - cubic)));
      color = mix(color, vec3(1, 0.7, 0.3), 1 - smoothstep(0.008, 0.024, abs(my - quintic)));
    }
    return vec4(color, 1);
  },
});
