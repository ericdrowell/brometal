import { shader, vec3, vec4, texture, normalize, length, max, dot } from 'brometal';
import { lambert, blinnPhongSpec, hemisphereLight } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aUv: 'vec2' },
  uniforms: {
    uViewProj: 'mat4',
    uModel: 'mat4',
    uLightDir: 'vec3',
    uViewPos: 'vec3',
    uTex: 'sampler2D',
    /**
     * The engine plume as a point light. The same `uPulse` drives the plume's
     * own shader, so the hull brightens on exactly the frames the flame does —
     * two separately-derived flickers would visibly disagree.
     */
    uEnginePos: 'vec3',
    uEngineColor: 'vec3',
    uPulse: 'float',
  },
  varyings: { vNormal: 'vec3', vUv: 'vec2', vWorldPos: 'vec3' },

  vertex({ aPosition, aNormal, aUv }, { uViewProj, uModel }, v) {
    const world = uModel.mul(vec4(aPosition, 1));
    v.vWorldPos = world.xyz;
    v.vNormal = uModel.mul(vec4(aNormal, 0)).xyz;
    v.vUv = aUv;
    return uViewProj.mul(world);
  },

  fragment(
    { uLightDir, uViewPos, uTex, uEnginePos, uEngineColor, uPulse },
    { vNormal, vUv, vWorldPos },
  ) {
    const base = texture(uTex, vUv).xyz;
    const viewDir = normalize(uViewPos.sub(vWorldPos));
    const diffuse = lambert(vNormal, uLightDir);
    const specular = blinnPhongSpec(vNormal, uLightDir, viewDir, 48) * 0.35;
    const ambient = hemisphereLight(vNormal, vec3(0.55, 0.6, 0.75), vec3(0.25, 0.22, 0.3));
    // Engine light: inverse-square from the nozzle. It sits behind and below
    // the hull, so it rims the tail and the underside of the wings — surfaces
    // the key light never reaches, which is what sells the flame as a light
    // source rather than a sprite pasted on top.
    const toEngine = uEnginePos.sub(vWorldPos);
    const distance = length(toEngine);
    const engineDir = normalize(toEngine);
    const falloff = uPulse / (1 + distance * distance * 1.1);
    const engineDiffuse = max(dot(normalize(vNormal), engineDir), 0) * falloff * 4.2;
    const engineSpec = blinnPhongSpec(vNormal, engineDir, viewDir, 64) * falloff * 2.2;

    const lit = base.mul(
      ambient.scale(0.5).add(vec3(1, 1, 1).scale(diffuse * 0.85)).add(uEngineColor.scale(engineDiffuse)),
    );
    return vec4(
      lit.add(vec3(1, 1, 1).scale(specular)).add(uEngineColor.scale(engineSpec)),
      1,
    );
  },
});
