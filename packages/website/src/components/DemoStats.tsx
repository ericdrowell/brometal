'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';

export interface FrameStats {
  /** Frames per second, averaged over the last sampling window. */
  fps: number;
  /** Milliseconds per frame, from the same window. */
  ms: number;
}

const SAMPLE_SECONDS = 0.5;

/**
 * Frame timing for the stats line.
 *
 * `tick` is called once per rendered frame from inside the render loop, but it
 * only touches React state twice a second. Setting state every frame would
 * re-render the whole demo tree on each one, which costs more than the frame it
 * is trying to measure — and the number would flicker too fast to read anyway.
 */
export function useFrameStats(): { stats: FrameStats; tick: (elapsedSeconds: number) => void } {
  const [stats, setStats] = useState<FrameStats>({ fps: 0, ms: 0 });
  const frames = useRef(0);
  const window = useRef(0);
  const last = useRef(0);

  const tick = useCallback((elapsedSeconds: number): void => {
    // Clamped, so a backgrounded tab resuming after seconds away does not
    // report one enormous frame and drag the average down for a full window.
    const delta = Math.min(Math.max(elapsedSeconds - last.current, 0), 0.25);
    last.current = elapsedSeconds;
    frames.current += 1;
    window.current += delta;
    if (window.current >= SAMPLE_SECONDS) {
      const fps = frames.current / window.current;
      setStats({ fps: Math.round(fps), ms: Math.round((1000 / Math.max(fps, 0.001)) * 10) / 10 });
      frames.current = 0;
      window.current = 0;
    }
  }, []);

  return { stats, tick };
}

/**
 * The stats line in the bottom-left of a demo. Children are whatever is worth
 * saying about that particular scene — instance counts, draw calls, pass counts
 * — and appear after the timing.
 */
export default function DemoStats({
  stats,
  children,
}: {
  stats: FrameStats;
  children?: ReactNode;
}) {
  return (
    <div className="hud">
      <strong>
        {stats.fps} fps · {stats.ms.toFixed(1)} ms
      </strong>
      {children === undefined ? null : (
        <>
          <br />
          {children}
        </>
      )}
    </div>
  );
}
