import { shader, vec4, sin, cos, cross, dot } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aColor: 'vec3' },
  instanceAttributes: {
    iOffset: 'vec3',
    iAxis: 'vec3',
    iSpeed: 'float',
    iScale: 'float',
    iTint: 'vec3',
  },
  uniforms: { uViewProj: 'mat4', uTime: 'float' },
  varyings: { vColor: 'vec3' },

  vertex({ aPosition, aColor, iOffset, iAxis, iSpeed, iScale, iTint }, { uViewProj, uTime }, v) {
    const angle = uTime * iSpeed;
    const c = cos(angle);
    const s = sin(angle);
    const p = aPosition.scale(iScale);
    const rotated = p.scale(c)
      .add(cross(iAxis, p).scale(s))
      .add(iAxis.scale(dot(iAxis, p) * (1 - c)));
    v.vColor = aColor.mul(iTint);
    return uViewProj.mul(vec4(rotated.add(iOffset), 1));
  },

  fragment(_uniforms, { vColor }) {
    return vec4(vColor, 1);
  },
});
