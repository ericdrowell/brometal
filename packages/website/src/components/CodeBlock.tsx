'use client';

import type { CSSProperties } from 'react';
import { useRef } from 'react';

/**
 * A code surface that selects itself when you click it.
 *
 * The page exists so people can take this code, and dragging across several
 * hundred lines in a scrolling box is miserable. A click selects the lot, ready
 * to copy with the keyboard.
 *
 * A drag is left alone. Both a click and a drag end in a `click` event, so
 * selecting unconditionally would wipe out a deliberate partial selection the
 * instant the mouse came up. A drag leaves a non-collapsed selection behind,
 * which is the signal to keep hands off.
 */
export default function CodeBlock({
  code,
  maxHeight,
}: {
  code: string;
  maxHeight?: number;
}) {
  const ref = useRef<HTMLPreElement>(null);

  const selectAll = (): void => {
    const node = ref.current;
    const selection = window.getSelection();
    if (node === null || selection === null) return;
    if (!selection.isCollapsed) return;

    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const style: CSSProperties | undefined = maxHeight ? { maxHeight } : undefined;
  return (
    <pre ref={ref} className="copy-block-code" style={style} onClick={selectAll}>
      {code}
    </pre>
  );
}
