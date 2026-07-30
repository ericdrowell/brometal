'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createProgram,
  createRenderer,
  loadTexture,
  type BroMetalProgram,
  type RendererBackend,
} from 'brometal';
import blendShader from '@/lib/sprite-lib/shaders/sprite-blend.shader.gen';
import cutoutShader from '@/lib/sprite-lib/shaders/sprite-cutout.shader.gen';
import {
  QUAD_INDICES,
  QUAD_POSITIONS,
  QUAD_UVS,
  SpriteBatch,
  billboardBasis,
  spriteAtlas,
} from '@/lib/sprite-lib/sprites';
import { buildSpriteScene, orbitCamera } from '@/lib/sprite-lib/sprite-scene';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import DemoCredit from '@/lib/sprite-lib/DemoCredit';

type BlendProgram = BroMetalProgram<
  (typeof blendShader)['attributes'],
  (typeof blendShader)['instanceAttributes'],
  (typeof blendShader)['uniforms']
>;

export type SpriteMode = 'blend' | 'cutout';

/**
 * Both sprite demos are this component with one prop flipped, so the only
 * difference between the pages is the technique — same scene, same camera,
 * same atlas, same batch code.
 *
 * blend:  program blends alpha, cannot write depth, needs a CPU sort per frame.
 * cutout: program discards sub-threshold alpha and writes depth, so the GPU
 *         orders the sprites and the instance data is uploaded exactly once.
 */
export default function SpriteCompareDemo({ mode }: { mode: SpriteMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [sortEnabled, setSortEnabled] = useState(true);
  const sortEnabledRef = useRef(true);
  const [detail, setDetail] = useState({ sprites: 0, sortMs: 0, uploads: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, { clearColor: [0.53, 0.75, 0.85, 1] });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      // Pixel art: nearest filtering, and clamped so a tile cannot sample its
      // neighbour across the atlas seam.
      const atlasTexture = await loadTexture(renderer, '/sprites/tiny-town.png', {
        filter: 'nearest',
        wrap: 'clamp',
      });
      if (cancelled) {
        atlasTexture.dispose();
        renderer.destroy();
        return;
      }
      const atlas = spriteAtlas(atlasTexture, {
        cols: 12,
        rows: 11,
        tileWidth: 16,
        tileHeight: 16,
      });

      // The ground is opaque in both demos — it is the sprites that differ. An
      // ordinary unblended program draws it, which is exactly what it was
      // before any of this work.
      const groundProgram: BlendProgram = createProgram(renderer, blendShader);

      // Only the sprite program differs between the two demos. The cut-out one
      // has an extra uniform, so it is built through its own typed handle and
      // then narrowed to the shared shape the draw loop uses.
      let spriteProgram: BlendProgram;
      if (mode === 'cutout') {
        const cutout = createProgram(renderer, cutoutShader, {
          // The combination that was impossible before: alpha blending for the
          // edge pixels the atlas does contain, AND depth writes so the GPU
          // orders the sprites.
          blend: 'alpha',
          depthWrite: true,
        });
        cutout.uniforms.uCutoff.set(0.5);
        spriteProgram = cutout as unknown as BlendProgram;
      } else {
        spriteProgram = createProgram(renderer, blendShader, { blend: 'alpha' });
      }

      for (const program of [groundProgram, spriteProgram]) {
        program.attributes.aPosition.set(QUAD_POSITIONS);
        program.attributes.aUv.set(QUAD_UVS);
        program.setIndices(QUAD_INDICES);
      }

      const scene = buildSpriteScene();

      // Ground tiles are the same quad laid flat: the basis is X/Z instead of
      // X/Y-locked. One shader, two bases.
      const groundBatch = new SpriteBatch(atlas, scene.ground.length);
      for (const tile of scene.ground) {
        groundBatch.push({ x: tile.x, y: 0, z: tile.z, width: 1, height: 1, tile: tile.tile });
      }
      const spriteBatch = new SpriteBatch(atlas, scene.plants.length);
      for (const plant of scene.plants) {
        spriteBatch.push({
          x: plant.x,
          // Centred quad, so lifting by half the height puts the base on the
          // ground.
          y: plant.size / 2,
          z: plant.z,
          width: plant.size,
          height: plant.size,
          tile: plant.tile,
          tint: plant.tint,
        });
      }

      const uploadBatch = (program: BlendProgram, batch: SpriteBatch): void => {
        program.instanceAttributes.iCenter.set(batch.centers);
        program.instanceAttributes.iSize.set(batch.sizes);
        program.instanceAttributes.iUvRect.set(batch.uvRects);
        program.instanceAttributes.iTint.set(batch.tints);
      };

      uploadBatch(groundProgram, groundBatch);
      // Cut-out sprites never need reordering, so this upload is the only one
      // that ever happens. The blended path re-uploads every frame below.
      uploadBatch(spriteProgram, spriteBatch);

      const camera = createCamera({ fovY: Math.PI / 3.4, near: 0.5, far: 200 });
      const right = new Float32Array(3);
      const up = new Float32Array(3);
      const groundRight = new Float32Array([1, 0, 0]);
      const groundUp = new Float32Array([0, 0, 1]);

      let uploadsThisSecond = 0;
      let sortMsAccum = 0;
      let framesThisSecond = 0;
      let lastReport = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const { position, target } = orbitCamera(t, scene.extent);
        camera.setPosition(position[0], position[1], position[2]);
        camera.lookAt(target[0], target[1], target[2]);
        const viewProj = camera.viewProjection(renderer.aspect);
        const view = camera.view();

        let sortMs = 0;
        let uploads = 0;
        if (mode === 'blend' && sortEnabledRef.current) {
          // The work the cut-out path deletes: order every sprite by distance
          // from the camera, then push all four instance arrays again.
          const started = performance.now();
          spriteBatch.sort((x, y, z) => {
            const dx = x - position[0];
            const dy = y - position[1];
            const dz = z - position[2];
            return dx * dx + dy * dy + dz * dz;
          });
          sortMs = performance.now() - started;
          uploadBatch(spriteProgram, spriteBatch);
          uploads = 4;
        }

        // Ground first: opaque, writes depth, so it can occlude sprites behind
        // it whichever technique the sprites use.
        groundProgram.uniforms.uViewProj.set(viewProj);
        groundProgram.uniforms.uRight.set(groundRight);
        groundProgram.uniforms.uUp.set(groundUp);
        groundProgram.uniforms.uAtlas.set(atlasTexture);
        groundProgram.draw({ instanceCount: groundBatch.count });

        billboardBasis(view, true, right, up);
        spriteProgram.uniforms.uViewProj.set(viewProj);
        spriteProgram.uniforms.uRight.set(right);
        spriteProgram.uniforms.uUp.set(up);
        spriteProgram.uniforms.uAtlas.set(atlasTexture);
        spriteProgram.draw({ instanceCount: spriteBatch.count });

        sortMsAccum += sortMs;
        uploadsThisSecond += uploads;
        framesThisSecond += 1;
        if (t - lastReport >= 0.5) {
          setDetail({
            sprites: spriteBatch.count,
            sortMs: sortMsAccum / Math.max(framesThisSecond, 1),
            uploads: uploadsThisSecond / Math.max(framesThisSecond, 1),
          });
          sortMsAccum = 0;
          uploadsThisSecond = 0;
          framesThisSecond = 0;
          lastReport = t;
        }
      });

      cleanup = () => {
        stop();
        groundProgram.dispose();
        spriteProgram.dispose();
        atlasTexture.dispose();
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const isCutout = mode === 'cutout';

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>{isCutout ? 'Cut-out sprites' : 'Blended sprites'}</h1>
          <p>
            {isCutout ? (
              <>
                The fragment stage calls <code>discard()</code> below 50% alpha, so every surviving
                fragment is opaque and the program sets <code>depthWrite: true</code>. The depth
                buffer orders the sprites, per pixel. Nothing is sorted, and the instance arrays
                were uploaded once at startup.
              </>
            ) : (
              <>
                The program blends alpha, so it cannot write depth — nothing on the GPU knows which
                tree is in front. Correctness depends entirely on the CPU sorting every sprite
                back-to-front and re-uploading all four instance arrays, every frame.
              </>
            )}
          </p>
          {isCutout ? null : (
            <div className="row">
              <label htmlFor="sort">CPU sort</label>
              <input
                id="sort"
                type="checkbox"
                checked={sortEnabled}
                onChange={(event) => {
                  setSortEnabled(event.target.checked);
                  sortEnabledRef.current = event.target.checked;
                }}
              />
              <output htmlFor="sort">{sortEnabled ? 'on' : 'off'}</output>
            </div>
          )}
          {isCutout ? null : (
            <p>
              Turn the sort off to see what the depth buffer was doing for free: trunks drawn over
              canopies in front of them, and the whole forest reshuffling as the camera orbits. Turn
              it back on and look at the clumps where two quads intersect — sorting picks one order
              for the whole sprite, so those seams stay wrong either way.
            </p>
          )}
        </div>
      </div>
      <DemoStats stats={stats}>
        {detail.sprites} sprites · 2 draw calls ·{' '}
        {isCutout ? (
          <>no sort, 0 uploads/frame</>
        ) : (
          <>
            sort {detail.sortMs.toFixed(2)} ms/frame · {detail.uploads.toFixed(0)} uploads/frame
          </>
        )}
        <br />
        <DemoCredit />
        <br />
        Sprites: Tiny Town by <a href="https://kenney.nl/assets/tiny-town">Kenney</a> (CC0)
      </DemoStats>
      <BackendBadge backend={backend} />
    </>
  );
}
