'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createPlane,
  createProgram,
  createRenderer,
  type BroMetalProgram,
  type GpuRecord,
  type Renderer,
  type RendererBackend,
} from 'brometal';
import BackendBadge from '@/components/BackendBadge';
import { FN_CATEGORY_ORDER, FN_EXAMPLES, type FnExample } from '@/lib/fn-catalog';

type QuadProgram = BroMetalProgram<
  { aPosition: 'vec3'; aUv: 'vec2' },
  GpuRecord,
  { uTime: 'float'; uAspect: 'float' }
>;

export default function ShaderFunctionsDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const quadRef = useRef<ReturnType<typeof createPlane> | null>(null);
  // Programs are created lazily on first selection — 63 upfront pipelines
  // would slow page load for no benefit.
  const programsRef = useRef(new Map<string, QuadProgram>());
  const activeRef = useRef(FN_EXAMPLES[0]!.key);
  const [selected, setSelected] = useState(FN_EXAMPLES[0]!.key);

  const ensureProgram = (key: string): void => {
    const renderer = rendererRef.current;
    const quad = quadRef.current;
    if (renderer === null || quad === null || programsRef.current.has(key)) return;
    const entry = FN_EXAMPLES.find((fn) => fn.key === key);
    if (entry === undefined) return;
    const program = createProgram(renderer, entry.shader) as unknown as QuadProgram;
    program.attributes.aPosition.set(quad.positions);
    program.attributes.aUv.set(quad.uvs);
    program.setIndices(quad.indices);
    programsRef.current.set(key, program);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, { clearColor: [0.07, 0.07, 0.1, 1] });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);
      rendererRef.current = renderer;
      quadRef.current = createPlane({ width: 2, height: 2 });
      ensureProgram(activeRef.current);

      const stop = renderer.loop((t) => {
        const program = programsRef.current.get(activeRef.current);
        if (program === undefined) return;
        program.uniforms.uTime.set(t);
        program.uniforms.uAspect.set(renderer.aspect);
        program.draw();
      });

      cleanup = () => {
        stop();
        for (const program of programsRef.current.values()) {
          program.dispose();
        }
        programsRef.current.clear();
        rendererRef.current = null;
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelect = (key: string): void => {
    ensureProgram(key);
    activeRef.current = key;
    setSelected(key);
  };

  const byCategory = new Map<string, FnExample[]>();
  for (const fn of FN_EXAMPLES) {
    const list = byCategory.get(fn.category) ?? [];
    list.push(fn);
    byCategory.set(fn.category, list);
  }
  const selectedEntry = FN_EXAMPLES.find((fn) => fn.key === selected);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Shader Functions</h1>
          <p className="panel-note">
            A visual example for every one of the {FN_EXAMPLES.length} functions in{' '}
            <code>brometal/shader-functions</code>.
          </p>
          <select
            className="effect-select"
            value={selected}
            onChange={(event) => onSelect(event.target.value)}
          >
            {FN_CATEGORY_ORDER.map((category) => (
              <optgroup key={category} label={category}>
                {(byCategory.get(category) ?? []).map((fn) => (
                  <option key={fn.key} value={fn.key}>
                    {fn.key}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedEntry === undefined ? null : (
            <>
              <p className="panel-note fn-signature">{selectedEntry.signature}</p>
              <p className="panel-note">{selectedEntry.doc}</p>
            </>
          )}
        </div>
      </div>
      <BackendBadge backend={backend} />
    </>
  );
}
