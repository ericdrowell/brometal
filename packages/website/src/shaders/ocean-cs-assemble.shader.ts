import {
  shader, vec4, floor, mod, max, min, storageRead, storageWrite,
} from 'brometal';

/**
 * Water Bro — turns raw transform output into the displacement the surface
 * reads, on the compute stage.
 *
 * Three things happen: the (-1)^(x+y) sign flip that undoes the half-period
 * shift from building the spectrum centred on k = 0; unpacking RG into Dx and
 * Dy; and foam from the Jacobian of the horizontal displacement, which goes
 * negative exactly where the surface has folded over itself.
 *
 * The fragment version of this got foam wrong on one backend and not the other,
 * because it reasoned about a *neighbouring texel's* checkerboard parity while
 * the two backends fill a render target's rows in opposite directions. Indexing
 * a flat buffer has no such ambiguity — the neighbour of (x, y) is (x+1, y) on
 * every backend, and the parity follows.
 */
export const OceanCsAssemble = shader({
  uniforms: {
    uPatchSize: 'float', uChoppiness: 'float', uScale: 'float',
    uFoamThreshold: 'float', uCount: 'float',
  },
  storage: { uTransform: 'vec4', uDisplacement: 'vec4' },
  workgroupSize: [64, 1, 1],

  compute({ uTransform, uDisplacement, uPatchSize, uChoppiness, uScale, uFoamThreshold, uCount }, id) {
    const size = 128;
    const index = min(floor(id.x), max(uCount - 1, 0));
    const x = mod(index, size);
    const y = floor(index / size);

    const sign = 1 - 2 * mod(x + y, 2);
    const gain = uScale * sign;

    const centre = storageRead(uTransform, index);
    const dx = centre.x * uChoppiness * gain;
    const dy = centre.y * gain;
    const dz = centre.z * uChoppiness * gain;

    // Wrapped neighbours, so the patch tiles. Their sign is the opposite of the
    // centre's, hence the negation when differencing.
    const rightIndex = y * size + mod(x + 1, size);
    const upIndex = mod(y + 1, size) * size + x;
    const right = storageRead(uTransform, rightIndex);
    const up = storageRead(uTransform, upIndex);

    // Per metre, not per texel: one texel spans uPatchSize/size metres.
    const perMetre = size / uPatchSize;
    const dxdx = (0 - right.x * uChoppiness * gain - dx) * perMetre;
    const dzdx = (0 - right.z * uChoppiness * gain - dz) * perMetre;
    const dxdz = (0 - up.x * uChoppiness * gain - dx) * perMetre;
    const dzdz = (0 - up.z * uChoppiness * gain - dz) * perMetre;

    const jacobian = (1 + dxdx) * (1 + dzdz) - dxdz * dzdx;
    const foam = max(uFoamThreshold - jacobian, 0);

    storageWrite(uDisplacement, index, vec4(dx, dy, dz, foam));
  },
});
