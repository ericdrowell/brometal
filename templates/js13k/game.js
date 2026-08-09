// Your game. Everything here is a global — no imports, no modules — so the
// minifier can mangle across this file, the runtime and the shaders together.

const cv = document.getElementById('c');

// A unit cube built at runtime rather than stored: 24 vertices is far more
// bytes as a literal than as the six-face loop that produces it.
const FACES = [
  [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1],
];
const pos = [], nrm = [], uvs = [], idx = [];
FACES.forEach((n, f) => {
  // Two vectors spanning the face. Rotating the normal's components gives a
  // perpendicular for any axis-aligned face; the cross of the two completes it.
  const a = [n[1], n[2], n[0]];
  const b = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([s, t]) => {
    pos.push(
      (n[0] + a[0] * s + b[0] * t) * 0.5,
      (n[1] + a[1] * s + b[1] * t) * 0.5,
      (n[2] + a[2] * s + b[2] * t) * 0.5,
    );
    nrm.push(n[0], n[1], n[2]);
    uvs.push((s + 1) / 2, (t + 1) / 2);
  });
  const v = f * 4;
  idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
});

bmInit(cv, [0.04, 0.04, 0.09, 1]).then(() => {
  // Procedural texture painted into a 2D canvas — cheaper than any image.
  const c2 = document.createElement('canvas');
  c2.width = c2.height = 32;
  const g = c2.getContext('2d');
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      g.fillStyle = (x ^ y) & 8 ? '#e9c46a' : '#2a9d8f';
      g.fillRect(x, y, 1, 1);
    }
  }
  const tex = bmTexture(c2, 0);

  const p = bmProgram(Cube[0], {
    a: Cube[1], i: Cube[2], u: Cube[3], t: Cube[4], cull: 1,
  });
  bmAttr(p, 0, new Float32Array(pos));
  bmAttr(p, 1, new Float32Array(nrm));
  bmAttr(p, 2, new Float32Array(uvs));
  bmIndex(p, new Uint16Array(idx));
  bmTextures(p, tex);

  bmLoop((t) => {
    const model = bmMul(bmRotY(t * 0.7), bmRotX(t * 0.4));
    const view = bmLook([0, 0, 3], [0, 0, 0], [0, 1, 0]);
    const proj = bmPersp(1, cv.width / cv.height, 0.1, 100);

    // The uniform block is a flat Float32Array. Offsets are in the comment
    // above Cube in dist/shaders.js.
    const u = new Float32Array(Cube[3] / 4);
    u.set(bmMul(proj, bmMul(view, model)), 0);   // uMvp
    u.set(model, 16);                             // uModel
    u.set([0.5, 0.8, 0.6], 32);                   // uLight
    bmUniforms(p, u);
    bmDraw(p);
  });
});
