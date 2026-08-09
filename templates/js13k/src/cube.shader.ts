import { shader, vec4, texture, normalize, max, dot } from 'brometal';

/**
 * One textured, lambert-lit shader. Written in BroMetal's typed TypeScript DSL
 * and compiled to WGSL at build time — the compiler never ships, so none of this
 * counts against the 13 kB.
 *
 * The exported name is the one the game uses — `Cube` here becomes the global
 * `Cube` in dist/shaders.js, unchanged.
 */
export const Cube = shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aUv: 'vec2' },
  uniforms: { uMvp: 'mat4', uModel: 'mat4', uLight: 'vec3', uTex: 'sampler2D' },
  varyings: { vNormal: 'vec3', vUv: 'vec2' },

  vertex({ aPosition, aNormal, aUv }, { uMvp, uModel }, v) {
    v.vNormal = uModel.mul(vec4(aNormal, 0)).xyz;
    v.vUv = aUv;
    return uMvp.mul(vec4(aPosition, 1));
  },

  fragment({ uLight, uTex }, { vNormal, vUv }) {
    const lambert = max(dot(normalize(vNormal), normalize(uLight)), 0);
    return vec4(texture(uTex, vUv).xyz.scale(lambert * 0.8 + 0.2), 1);
  },
});
