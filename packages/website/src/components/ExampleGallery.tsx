'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { exampleSourceUrl, type ExampleEntry, type ExampleSection } from '@/lib/examples';

function ExampleCard({ example, onOpen }: {
  example: ExampleEntry;
  onOpen: (example: ExampleEntry) => void;
}) {
  const openPreview = (event: MouseEvent<HTMLAnchorElement>): void => {
    // Preserve normal browser affordances: modified clicks still open a tab,
    // while an ordinary click keeps the visitor's place in the catalogue.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(example);
  };
  return (
    <li className="example-card">
      <Link href={`/examples/${example.slug}`} onClick={openPreview}>
        <div className="example-preview">
          <Image
            src={`/examples/${example.slug}.jpg`}
            alt={`${example.name} example preview`}
            fill
            sizes="(max-width: 560px) 100vw, (max-width: 820px) 50vw, 33vw"
            className="example-preview-image"
          />
          <span className="preview-live">LIVE</span>
        </div>
        <div className="example-card-copy">
          <div className="example-card-heading">
            <span className="name">{example.name}</span>
            {example.preset !== undefined && <span className="new-badge">NEW</span>}
          </div>
          <p className="desc">{example.description}</p>
          {example.tags !== undefined && (
            <div className="example-tags">
              {example.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}

export default function ExampleGallery({ sections }: { sections: ExampleSection[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ExampleEntry | null>(null);
  const normalized = query.trim().toLowerCase();
  // Categories are registry metadata only; the visible catalogue is one
  // predictable alphabetical stream.
  const ordered = useMemo(() => {
    return sections
      .flatMap((section) => section.examples)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sections]);
  const filtered = useMemo(() => ordered.filter((example) => {
    const haystack = [example.name, example.description, ...(example.tags ?? [])].join(' ').toLowerCase();
    return normalized === '' || haystack.includes(normalized);
  }), [ordered, normalized]);
  const resultCount = filtered.length;
  const navigationExamples = filtered;
  const selectedIndex = selected === null
    ? -1
    : navigationExamples.findIndex((example) => example.slug === selected.slug);
  const canCycle = selectedIndex >= 0 && navigationExamples.length > 1;
  const previous = canCycle
    ? navigationExamples[(selectedIndex - 1 + navigationExamples.length) % navigationExamples.length]
    : undefined;
  const next = canCycle
    ? navigationExamples[(selectedIndex + 1) % navigationExamples.length]
    : undefined;

  const openExample = (example: ExampleEntry): void => {
    window.history.pushState(
      { ...window.history.state, brometalDemo: example.slug },
      '',
      `/examples/${example.slug}`,
    );
    setSelected(example);
  };

  const navigateExample = (example: ExampleEntry): void => {
    window.history.replaceState(
      { ...window.history.state, brometalDemo: example.slug },
      '',
      `/examples/${example.slug}`,
    );
    setSelected(example);
  };

  const closeExample = (): void => {
    if (window.history.state?.brometalDemo !== undefined) {
      window.history.back();
      return;
    }
    window.history.replaceState(window.history.state, '', '/examples');
    setSelected(null);
  };

  useEffect(() => {
    const onPopState = (): void => {
      const match = window.location.pathname.match(/^\/examples\/([^/]+)$/);
      const example = match === null
        ? undefined
        : ordered.find((entry) => entry.slug === decodeURIComponent(match[1]!));
      setSelected(example ?? null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [ordered]);

  useEffect(() => {
    if (selected === null) return;
    const overflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeExample();
      if (event.key === 'ArrowLeft' && previous !== undefined) navigateExample(previous);
      if (event.key === 'ArrowRight' && next !== undefined) navigateExample(next);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [next, previous, selected]);

  return (
    <>
      <section className="example-browser" aria-labelledby="browse-heading">
        <div className="section-heading-row browse-title">
          <div>
            <p className="eyebrow">Explore the GPU</p>
            <h2 id="browse-heading">Choose an example</h2>
          </div>
          <span>{resultCount} live examples</span>
        </div>
        <div className="example-tools">
          <label className="example-search">
            <span className="sr-only">Search examples</span>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m14.4 13 4.1 4.1-1.4 1.4-4.1-4.1a7 7 0 1 1 1.4-1.4ZM8.5 14a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z" /></svg>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search noise, ocean, particles…" />
            {query !== '' && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </label>
        </div>

        <ul className="example-card-grid mixed-example-grid">
          {filtered.map((example) => (
            <ExampleCard key={example.slug} example={example} onOpen={openExample} />
          ))}
        </ul>
        {resultCount === 0 && (
          <div className="example-empty">
            <strong>No examples found.</strong>
            <span>Try a broader technique, like “noise”, “light”, or “fluid”.</span>
          </div>
        )}
      </section>
      {selected !== null && (
        <div className="demo-modal-backdrop" role="presentation" onMouseDown={closeExample}>
          <section
            className="demo-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} live example`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="demo-modal-bar">
              <div className="demo-modal-title">
                <strong>{selected.name}</strong>
              </div>
              <div className="demo-modal-actions">
                <a
                  href={exampleSourceUrl(selected)}
                  target="_blank"
                  rel="noreferrer"
                  className="demo-source-link"
                  title="View source on GitHub"
                >
                  <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                  </svg>
                  View source
                </a>
                <Link href={`/examples/${selected.slug}`} target="_blank" title="Open the canonical page in a new tab">
                  Open full page ↗
                </Link>
                <button type="button" className="demo-modal-close" onClick={closeExample} aria-label="Close example">
                  ×
                </button>
              </div>
            </header>
            <iframe
              key={selected.slug}
              src={`/examples/${selected.slug}?embed=1`}
              title={`${selected.name} live example`}
              allow="fullscreen; gamepad"
              onLoad={(event) => {
                const frame = event.currentTarget;
                const document = frame.contentDocument;
                if (document !== null && document.getElementById('demo-embed-style') === null) {
                  const style = document.createElement('style');
                  style.id = 'demo-embed-style';
                  style.textContent = '.site-header,.example-nav{display:none!important}.panels,.code-panel{top:16px!important}';
                  document.head.append(style);
                }
                frame.dataset.ready = 'true';
              }}
            />
            <button
              className="demo-modal-step demo-modal-previous"
              type="button"
              disabled={previous === undefined}
              onClick={() => previous !== undefined && navigateExample(previous)}
              aria-label={previous === undefined ? 'No previous example' : `Previous: ${previous.name}`}
              title="Previous example (left arrow)"
            >
              <b aria-hidden="true">←</b>
              <span><small>Previous</small>{previous?.name}</span>
            </button>
            <button
              className="demo-modal-step demo-modal-next"
              type="button"
              disabled={next === undefined}
              onClick={() => next !== undefined && navigateExample(next)}
              aria-label={next === undefined ? 'No next example' : `Next: ${next.name}`}
              title="Next example (right arrow)"
            >
              <span><small>Next</small>{next?.name}</span>
              <b aria-hidden="true">→</b>
            </button>
          </section>
        </div>
      )}
    </>
  );
}
