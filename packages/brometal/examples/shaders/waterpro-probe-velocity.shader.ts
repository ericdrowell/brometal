import { shader, vec4, max, min, floor, storageRead, storageWrite } from 'brometal';

/**
 * Water Bro — a direct port of Three.js Water Pro's probe velocity pass
 * (captured as 007-wgsl-compute.wgsl), used with permission.
 *
 * Differentiates probe positions between frames: velocity is the change in
 * position over the timestep, and this frame's positions become next frame's
 * history. The timestep is floored at 1 ms so a stalled or backgrounded frame
 * cannot divide through by zero and fling every probe to infinity.
 *
 * Two deliberate departures from the captured source, both forced by the DSL:
 *
 * - The original opens with `if (instanceIndex >= count) { return; }`. BroMetal
 *   has no early return, so the index is clamped instead. Both writes here are
 *   idempotent — a surplus invocation rewrites the last element with the value
 *   it already holds — so clamping is safe. It would NOT be safe for a pass that
 *   accumulates.
 * - Their `instanceIndex` folds all three dispatch axes into one linear index.
 *   This dispatches on X only, so id.x is already that index.
 */
export const WaterproProbeVelocity = shader({
  uniforms: { uDeltaTime: 'float', uCount: 'float' },
  storage: {
    /** Written: velocity per probe. */
    uVelocity: 'vec4',
    /** This frame's positions. */
    uPosition: 'vec4',
    /** Last frame's positions; updated in place at the end of the pass. */
    uPrevious: 'vec4',
  },
  workgroupSize: [64, 1, 1],

  compute({ uVelocity, uPosition, uPrevious, uDeltaTime, uCount }, id) {
    const index = min(floor(id.x), max(uCount - 1, 0));
    const step = max(uDeltaTime, 0.001);

    const current = storageRead(uPosition, index);
    const previous = storageRead(uPrevious, index);

    storageWrite(
      uVelocity,
      index,
      vec4(
        (current.x - previous.x) / step,
        (current.y - previous.y) / step,
        (current.z - previous.z) / step,
        0,
      ),
    );
    storageWrite(uPrevious, index, current);
  },
});
