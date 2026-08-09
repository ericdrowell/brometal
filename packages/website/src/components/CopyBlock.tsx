'use client';

import { useState } from 'react';
import CodeBlock from './CodeBlock';

/**
 * A code block with a copy button.
 *
 * The whole point of the js13k page is that you take the runtime and paste it
 * into your project, so the copy has to be one click rather than a select-all
 * through several hundred lines. The `<pre>` scrolls in its own box so a long
 * file cannot push the page sideways.
 */
export default function CopyBlock({
  code,
  label,
  note,
  maxHeight,
}: {
  code: string;
  label: string;
  note?: string;
  maxHeight?: number;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the code is selectable either way, so
      // there is nothing useful to say beyond not claiming success.
      setCopied(false);
    }
  };

  return (
    <div className="copy-block">
      <div className="copy-block-bar">
        <span className="copy-block-label">{label}</span>
        <button
          type="button"
          className={`copy-block-button${copied ? ' copied' : ''}`}
          onClick={copy}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      {note !== undefined ? <p className="copy-block-note">{note}</p> : null}
      <CodeBlock code={code} maxHeight={maxHeight} />
    </div>
  );
}
