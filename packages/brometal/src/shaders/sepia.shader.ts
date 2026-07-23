import { shader, vec2, vec3, vec4, texture, length, smoothstep, mix } from 'brometal';
import { luminance } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float', uTex: 'sampler2D' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect, uTex }, { vUv }) {
    const c = texture(uTex, vUv).xyz;
    const g = luminance(c);
    const sepia = vec3(g * 1.07, g * 0.85, g * 0.62);
    const graded = mix(c, sepia, 0.85);
    const centered = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
    const vig = 1 - smoothstep(0.3, 0.85, length(centered));
    return vec4(graded.scale(vig), 1);
  },
});
