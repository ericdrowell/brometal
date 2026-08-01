import { shader, vec2, vec4, abs, min, smoothstep } from 'brometal';
import { sdBox2, strokeAA } from 'brometal/shader-functions';

// Aiming reticles: instanced screen-facing quads painting four thin "L"
// corner brackets — a square outline with the edge midpoints masked out.
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  instanceAttributes: { iCenter: 'vec3', iSize: 'float', iAlpha: 'float' },
  uniforms: { uViewProj: 'mat4', uColor: 'vec3' },
  varyings: { vUv: 'vec2', vAlpha: 'float' },

  vertex({ aPosition, aUv, iCenter, iSize, iAlpha }, { uViewProj }, v) {
    v.vUv = aUv;
    v.vAlpha = iAlpha;
    return uViewProj.mul(vec4(iCenter.x + aPosition.x * iSize, iCenter.y + aPosition.y * iSize, iCenter.z, 1));
  },

  fragment({ uColor }, { vUv, vAlpha }) {
    const p = vUv.sub(vec2(0.5, 0.5));
    const outline = strokeAA(sdBox2(p, vec2(0.34, 0.34)), 0.012, 0.008);
    // Keep only the corners: fragments near an edge midpoint have one small
    // coordinate, so gate on min(|x|, |y|) to carve the four gaps.
    const corner = smoothstep(0.2, 0.23, min(abs(p.x), abs(p.y)));
    return vec4(uColor, outline * corner * vAlpha);
  },
});
