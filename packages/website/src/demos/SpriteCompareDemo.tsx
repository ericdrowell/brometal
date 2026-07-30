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
  AXIS_GROUND_UP,
  AXIS_RIGHT,
  QUAD_INDICES,
  QUAD_POSITIONS,
  QUAD_UVS,
  SpriteBatch,
  billboardBasis,
  spriteAtlas,
  uploadSpriteBatch,
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
 * What one sprite costs to re-upload, taken from the compiled shader instead of
 * written down: the instance attributes are the ones with divisor 1, which today
 * means iCenter 3 + iSize 2 + iUvRect 4 + iTint 4 = 13 floats across 4 `set()`
 * calls. No figure the page *shows* repeats them as a literal — the HUD and the
 * paragraph that explains the HUD both read these constants.
 *
 * The page's whole claim is a measured cost, so the HUD reports bytes rather
 * than a bare "4 uploads" — a count with no unit attached is not a figure anyone
 * can check. Both numbers are derived because a hardcoded stride is exactly the
 * kind of figure that goes stale the first time someone edits the shader,
 * silently, in the direction of flattering the demo.
 */
const INSTANCE_ATTRIBUTES = blendShader.layout.attributes.filter((entry) => entry.divisor === 1);
const INSTANCE_FLOATS = INSTANCE_ATTRIBUTES.reduce((total, entry) => total + entry.size, 0);
const UPLOAD_CALLS = INSTANCE_ATTRIBUTES.length;

/** Bytes in a unit a reader can hold: exact when it is zero, KiB when it is not. */
function formatBytesPerFrame(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B/frame`;
  return `${(bytes / 1024).toFixed(1)} KiB/frame`;
}

/**
 * Both sprite demos are this component with one prop flipped, so the only
 * difference between the pages is the technique — same scene, same camera,
 * same atlas, same batch code.
 *
 * blend:  program blends alpha, cannot write depth, needs a CPU sort per frame.
 * cutout: program discards sub-threshold alpha and writes depth, so the GPU
 *         orders the sprites and the instance data is uploaded exactly once.
 *
 * ## Why almost nothing here has been moved to the GPU
 *
 * This page is an A/B, so the blended half is a *control* and shrinking it
 * shrinks the thing being measured. Three moves that would be right in any other
 * demo are refused here on purpose, recorded so nobody has to re-derive them:
 *
 * - Packing each plant into a seed (x, z, halfHeight) and deriving size, tile
 *   and tint in the vertex shader takes the per-frame upload from 13 floats a
 *   sprite to 3 — 23,192 B/frame down to 5,352. But it has to land in BOTH
 *   sprite shaders identically or the two pages draw different forests, and the
 *   pair's entire function is that diffing the two files turns up a handful of
 *   lines in the fragment stage. Forty-odd lines of duplicated procedural setup
 *   in each file destroys that. Do this packing in the topdown or world demos,
 *   where there is no control to preserve.
 * - Generating the 1,024 ground tiles procedurally in the vertex shader from
 *   `hash21(vec2(ix, iz))` saves a one-time 53 KiB upload nothing measures, and
 *   costs 4,096 vertex hashes every frame forever. Clipping happens after the
 *   vertex stage, so no culling trick pays that back.
 * - Keeping the instance data static in a data texture and uploading only the
 *   sorted *index* per sprite — 1 float instead of 13, and no permute at all —
 *   is the real fix for a blended renderer, and it is the wrong thing here. The
 *   control has to be the naive path, because "blending costs you a sort and a
 *   re-upload" is the claim under test; optimising the control both understates
 *   the cost and moves `sortMs`, the number the page headlines. It belongs in a
 *   demo of its own.
 */
export default function SpriteCompareDemo({ mode }: { mode: SpriteMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [sortEnabled, setSortEnabled] = useState(true);
  const sortEnabledRef = useRef(true);
  const [detail, setDetail] = useState({ sprites: 0, sortMs: 0, uploads: 0, uploadBytes: 0 });

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
      //
      // In blend mode this links the same shader twice, once here and once for
      // the sprites. That is deliberate, not waste: `uploadSpriteBatch` skips
      // uploads for a clean batch, and that skip is only sound with one program
      // per batch — two batches sharing a program would end up drawing each
      // other's instances the first time a skip fires. The compiled GLSL is
      // shared; only the buffers are duplicated.
      const groundProgram: BlendProgram = createProgram(renderer, blendShader);

      // Only the sprite program differs between the two demos. The cut-out one
      // has an extra uniform, so it is built through its own typed handle and
      // then narrowed to the shared shape the draw loop uses.
      let spriteProgram: BlendProgram;
      if (mode === 'cutout') {
        const cutout = createProgram(renderer, cutoutShader, {
          // The combination that was impossible before: a blended pipeline that
          // ALSO writes depth, so the GPU orders the sprites.
          //
          // Worth being precise about what the blending does here, because it is
          // easy to over-claim: the cut-out fragment returns alpha = 1 on every
          // surviving pixel, so src*1 + dst*0 — the blend equation is an
          // identity and nothing actually blends. `blend: 'alpha'` is kept so
          // the two pages differ in exactly one thing, the fragment stage.
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

      // `uploadSpriteBatch` uploads the live prefix and only when the batch is
      // dirty. Here capacity happens to equal count, so it moves the same bytes
      // a hand-rolled upload would — the reason to use it is that "0 uploads
      // per frame" on the cut-out page becomes a property of the code (nothing
      // marks the batch dirty again) instead of a property of this loop
      // remembering not to call set().
      uploadSpriteBatch(groundProgram, groundBatch);
      // Cut-out sprites never need reordering, so this upload is the only one
      // that ever happens. The blended path re-uploads every frame below.
      uploadSpriteBatch(spriteProgram, spriteBatch);

      // Uniforms that never change are set once. The ground's basis is two
      // module-level constants and the atlas never rebinds, so re-setting them
      // every frame was four `set()` calls buying nothing.
      //
      // Worth knowing how small this is before copying it as a technique: on
      // WebGL it drops two `useProgram` round-trips and two redundant texture
      // binds a frame; on WebGPU the uniform block is re-staged in full at every
      // frame boundary regardless, so it saves no bytes there at all. It is free
      // and it leaves the loop showing only what genuinely changes. The sprite
      // basis is the one that does — re-derived from the view matrix below.
      groundProgram.uniforms.uRight.set(AXIS_RIGHT);
      groundProgram.uniforms.uUp.set(AXIS_GROUND_UP);
      groundProgram.uniforms.uAtlas.set(atlasTexture);
      spriteProgram.uniforms.uAtlas.set(atlasTexture);

      const camera = createCamera({ fovY: Math.PI / 3.4, near: 0.5, far: 200 });
      const right = new Float32Array(3);
      const up = new Float32Array(3);

      let uploadsThisSecond = 0;
      let uploadBytesThisSecond = 0;
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
        if (mode === 'blend' && sortEnabledRef.current) {
          // The work the cut-out path deletes: order every sprite by distance
          // from the camera. Sorting dirties the batch, which is what makes the
          // upload below happen.
          //
          // The key is the full 3D distance on purpose. Dropping dy would be
          // cheaper and is tempting — the plants are short — but the camera
          // sits at y = 12, so dy² swings by ~26 across the forest, worth about
          // half a world unit of effective distance at this range. Clump radius
          // is 1.4, so a 2D key reshuffles order *within* a clump, which is
          // exactly the artefact the panel text tells the viewer to study.
          const started = performance.now();
          spriteBatch.sort((x, y, z) => {
            const dx = x - position[0];
            const dy = y - position[1];
            const dz = z - position[2];
            return dx * dx + dy * dy + dz * dz;
          });
          sortMs = performance.now() - started;
        }

        // Both modes run this, both modes report what it did. `uploadSpriteBatch`
        // returns early on a clean batch, so reading `dirty` first asks exactly
        // the question the upload asks — the cut-out page's headline "0 B/frame"
        // is therefore a measurement of this batch never being touched again,
        // not a claim. Add wind, or a clear() and refill, and the page says so
        // instead of going on insisting it is free.
        const uploaded = spriteBatch.dirty;
        uploadSpriteBatch(spriteProgram, spriteBatch);
        const uploads = uploaded ? UPLOAD_CALLS : 0;
        const uploadBytes = uploaded ? spriteBatch.count * INSTANCE_FLOATS * 4 : 0;

        // Ground first: opaque, writes depth, so it can occlude sprites behind
        // it whichever technique the sprites use.
        groundProgram.uniforms.uViewProj.set(viewProj);
        groundProgram.draw({ instanceCount: groundBatch.count });

        billboardBasis(view, true, right, up);
        spriteProgram.uniforms.uViewProj.set(viewProj);
        spriteProgram.uniforms.uRight.set(right);
        spriteProgram.uniforms.uUp.set(up);
        spriteProgram.draw({ instanceCount: spriteBatch.count });

        sortMsAccum += sortMs;
        uploadsThisSecond += uploads;
        uploadBytesThisSecond += uploadBytes;
        framesThisSecond += 1;
        if (t - lastReport >= 0.5) {
          const frames = Math.max(framesThisSecond, 1);
          setDetail({
            sprites: spriteBatch.count,
            sortMs: sortMsAccum / frames,
            uploads: uploadsThisSecond / frames,
            uploadBytes: uploadBytesThisSecond / frames,
          });
          sortMsAccum = 0;
          uploadsThisSecond = 0;
          uploadBytesThisSecond = 0;
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
  // "no sort" in both the cut-out case and the sort-off case, because in both
  // cases nothing is being sorted — the difference is whether that is correct.
  const sortLabel =
    isCutout || !sortEnabled ? 'no sort' : `sort ${detail.sortMs.toFixed(2)} ms/frame`;

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
                buffer orders the sprites, per pixel. Nothing is sorted and the instance arrays were
                uploaded once at startup. The readout below runs the same upload call the blended
                page does and reports what it actually moved: nothing.
              </>
            ) : (
              <>
                The program blends alpha, so it cannot write depth — nothing on the GPU knows which
                tree is in front. Correctness depends entirely on the CPU sorting every sprite
                back-to-front and re-uploading all four instance arrays, every frame. The readout
                below counts that traffic: {INSTANCE_FLOATS} floats per sprite across{' '}
                {UPLOAD_CALLS} upload calls, every frame, for as long as the page is open.
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
              for the whole sprite, so those seams stay wrong either way. Note that with the sort off
              the readout below drops to the cut-out page&rsquo;s numbers exactly: on this technique
              the whole per-frame cost <em>is</em> the cost of being correct.
            </p>
          )}
        </div>
      </div>
      <DemoStats stats={stats}>
        {detail.sprites} sprites · 2 draw calls · {sortLabel} ·{' '}
        {detail.uploads.toFixed(0)} uploads · {formatBytesPerFrame(detail.uploadBytes)}
        {/*
          With the sort switched off the blended page's three figures are the
          cut-out page's three figures exactly, which is true and is the trap:
          the cost went away and the correctness went with it. Caption it, or the
          readout reads as "blending is free if you skip the sort".
        */}
        {isCutout || sortEnabled ? null : " — the cut-out page's figures, without its pixels"}
        <br />
        <DemoCredit />
        <br />
        Sprites: Tiny Town by <a href="https://kenney.nl/assets/tiny-town">Kenney</a> (CC0)
      </DemoStats>
      <BackendBadge backend={backend} />
    </>
  );
}
