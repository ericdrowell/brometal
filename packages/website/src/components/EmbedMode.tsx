'use client';

import { useEffect } from 'react';

/** Lets same-origin modal iframes shed the site chrome after React hydrates. */
export default function EmbedMode() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('embed') !== '1') return;
    document.documentElement.classList.add('demo-embed');
    return () => document.documentElement.classList.remove('demo-embed');
  }, []);

  return null;
}
