import { shader, vec3, vec4, sin, cos, type Vec3 } from 'brometal';

function palette(t: number): Vec3 {
  return vec3(
    0.5 + 0.5 * cos(6.28318 * (t + 0.0)),
    0.5 + 0.5 * cos(6.28318 * (t + 0.33)),
    0.5 + 0.5 * cos(6.28318 * (t + 0.67)),
  );
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime }, { vUv }) {
    const x = vUv.x * 6 - 3;
    const y = vUv.y * 6 - 3;
    let value = 0;
    let frequency = 1;
    let amplitude = 0.6;
    for (let i = 0; i < 5; i += 1) {
      value = value + amplitude * sin(x * frequency + uTime + i * 1.7) * cos(y * frequency - uTime * 0.6 + i * 0.9);
      frequency *= 1.9;
      amplitude *= 0.65;
    }
    return vec4(palette(value * 0.5 + 0.15), 1);
  },
});
