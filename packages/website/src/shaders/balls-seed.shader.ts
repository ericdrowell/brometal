import { shader, vec2, vec3, vec4, floor, mod, max, mix, step } from 'brometal';
import { hash11 } from 'brometal/shader-functions';

/**
 * Writes the opening state, so even the starting arrangement never comes from
 * the CPU. Balls are placed on a lattice whose spacing exceeds a diameter and
 * jittered by less than the leftover gap, which guarantees no pair starts
 * overlapping — the simulation only has to *keep* them apart from there.
 */
export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uCount: 'float', uBounds: 'vec3', uRadius: 'float', uSpread: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment({ uCount, uBounds, uRadius, uSpread }, { vUv }) {
    // Same X-major layout as the step: left half positions, right half velocities.
    const isVelocity = step(0.5, vUv.x);
    const slot = vUv.x - isVelocity * 0.5;
    const index = floor(slot * 2 * uCount);
    const inner = vec3(uBounds.x - uRadius, uBounds.y - uRadius, uBounds.z - uRadius);
    // Lattice: as many columns as fit at a spacing wider than one diameter.
    const span = inner.x * 2;
    const columns = max(floor(span / (uRadius * 2.35)), 1);
    const spacing = span / columns;
    const cx = mod(index, columns);
    const cz = mod(floor(index / columns), columns);
    const cy = floor(index / (columns * columns));
    // Jitter stays inside the slack between spacing and diameter, so two
    // neighbours can never be brought within a diameter of each other.
    const slack = (spacing - uRadius * 2) * 0.4;
    const position = vec3(
      0 - inner.x + (cx + 0.5) * spacing + (hash11(index * 1.7 + 0.3) - 0.5) * slack,
      // Layers hang down from the ceiling rather than up from the middle, so
      // every ball has the full height of the tank to fall through. Even at the
      // 320-ball maximum that is five layers, which still clears the floor.
      inner.y - (cy + 0.5) * spacing + (hash11(index * 3.1 + 5.7) - 0.5) * slack,
      0 - inner.z + (cz + 0.5) * spacing + (hash11(index * 2.3 + 9.1) - 0.5) * slack,
    );
    const velocity = vec3(
      (hash11(index * 7.7 + 1.9) - 0.5) * uSpread,
      (hash11(index * 4.9 + 3.3) - 0.5) * uSpread * 0.4,
      (hash11(index * 6.1 + 8.5) - 0.5) * uSpread,
    );
    return vec4(mix(position, velocity, isVelocity), 1);
  },
});
