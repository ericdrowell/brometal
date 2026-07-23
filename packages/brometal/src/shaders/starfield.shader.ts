import { shader, vec2, vec3, vec4, floor, sin, distance, smoothstep } from 'brometal';
import { hash22, hash21 } from 'brometal/shader-functions';

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
    let brightness = 0;
    for (let layer = 1; layer <= 3; layer += 1) {
      const q = p.scale(layer * 10).add(vec2(uTime * 0.04 * layer, uTime * 0.01 * layer));
      const cell = vec2(floor(q.x), floor(q.y));
      const star = hash22(cell).scale(0.8).add(vec2(0.1, 0.1));
      const d = distance(q.sub(cell), star);
      const twinkle = 0.6 + 0.4 * sin(uTime * 3 + hash21(cell) * 40);
      brightness += (1 - smoothstep(0, 0.12 / layer, d)) * twinkle / layer;
    }
    return vec4(brightness, brightness, brightness * 1.15, 1);
  },
});
