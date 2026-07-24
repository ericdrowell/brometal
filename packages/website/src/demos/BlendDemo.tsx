'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createCube,
  createProgram,
  createRenderer,
  createSphere,
  mat4,
  type BlendMode,
  type RendererBackend,
} from 'brometal';
import BackendBadge from '@/components/BackendBadge';
import litShader from '@/shaders/game-lit.shader.gen';
import glowShader from '@/shaders/game-glow.shader.gen';

const ORBS = 10;

const MODES: { mode: BlendMode; label: string; note: string }[] = [
  { mode: 'none', label: 'None', note: 'Opaque — orbs occlude like solid geometry.' },
  { mode: 'alpha', label: 'Alpha', note: 'Classic transparency — see the cube through the orbs.' },
  { mode: 'additive', label: 'Additive', note: 'Light accumulation — overlaps get brighter, like glows.' },
];

export default function BlendDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const activeRef = useRef<BlendMode>('alpha');
  const [active, setActive] = useState<BlendMode>('alpha');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, { clearColor: [0.06, 0.06, 0.1, 1], cull: 'back' });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const cubeProgram = createProgram(renderer, litShader);
      const cube = createCube({ width: 1.4, height: 1.4, depth: 1.4 });
      cubeProgram.attributes.aPosition.set(cube.positions);
      cubeProgram.attributes.aNormal.set(cube.normals);
      cubeProgram.setIndices(cube.indices);
      cubeProgram.uniforms.uColor.set([0.8, 0.55, 0.3]);
      cubeProgram.uniforms.uLightDir.set([0.5, 0.8, 0.4]);

      // Same shader, three programs — the only difference is the blend option.
      const sphere = createSphere({ radius: 1, widthSegments: 20, heightSegments: 14 });
      const orbPrograms = new Map(
        MODES.map(({ mode }) => {
          const program = createProgram(renderer, glowShader, { blend: mode });
          program.attributes.aPosition.set(sphere.positions);
          program.setIndices(sphere.indices);
          program.uniforms.uColor.set([0.45, 0.65, 1]);
          return [mode, program] as const;
        }),
      );
      const orbOffsets = new Float32Array(ORBS * 3);
      const orbScales = new Float32Array(ORBS);
      const orbAlphas = new Float32Array(ORBS);

      const camera = createCamera({ position: [0, 1.6, 5] });
      camera.lookAt(0, 0, 0);

      const model = mat4.scratch();
      const tilt = mat4.scratch();

      const stop = renderer.loop((t) => {
        const viewProj = camera.viewProjection(renderer.aspect);

        mat4.multiply(mat4.rotationY(t * 0.4, model), mat4.rotationX(0.4, tilt), model);
        cubeProgram.uniforms.uViewProj.set(viewProj);
        cubeProgram.uniforms.uModel.set(model);
        cubeProgram.draw();

        for (let i = 0; i < ORBS; i++) {
          const angle = (i / ORBS) * Math.PI * 2 + t * 0.7;
          orbOffsets[i * 3] = Math.cos(angle) * 1.9;
          orbOffsets[i * 3 + 1] = Math.sin(t * 1.1 + i * 1.7) * 0.7;
          orbOffsets[i * 3 + 2] = Math.sin(angle) * 1.9;
          orbScales[i] = 0.4;
          orbAlphas[i] = 0.45;
        }
        const orbProgram = orbPrograms.get(activeRef.current)!;
        orbProgram.instanceAttributes.iOffset.set(orbOffsets);
        orbProgram.instanceAttributes.iScale.set(orbScales);
        orbProgram.instanceAttributes.iAlpha.set(orbAlphas);
        orbProgram.uniforms.uViewProj.set(viewProj);
        orbProgram.draw();
      });

      cleanup = () => {
        stop();
        cubeProgram.dispose();
        for (const program of orbPrograms.values()) {
          program.dispose();
        }
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const onSelect = (mode: BlendMode): void => {
    activeRef.current = mode;
    setActive(mode);
  };

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Blend</h1>
          <p className="panel-note">
            The orbs use one shader and three programs — only the{' '}
            <code>{`createProgram(..., { blend })`}</code> option differs.
          </p>
          <div className="geo-tiles blend-tiles">
            {MODES.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                data-blend={mode}
                className={active === mode ? 'selected' : undefined}
                onClick={() => onSelect(mode)}
              >
                <span>{label}</span>
              </button>
            ))}
          </div>
          <p className="panel-note uses-note">{MODES.find((m) => m.mode === active)?.note}</p>
        </div>
      </div>
      <BackendBadge backend={backend} />
    </>
  );
}
