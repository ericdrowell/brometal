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
import { useFrameStats } from '@/components/DemoStats';
import DemoCredit from '@/lib/sprite-lib/DemoCredit';

type BlendProgram = BroMetalProgram<
  (typeof blendShader)['attributes'],
  (typeof blendShader)['instanceAttributes'],
  (typeof blendShader)['uniforms']
>;

/**
 * One sprite costs this many floats to send again. The value comes from the
 * compiled shader, not from a comment: the instance attributes are the ones with
 * divisor 1. Today that is iCenter 3 + iSize 2 + iUvRect 4 + iTint 4 = 13 floats.
 *
 * A number written by hand goes stale when someone edits the shader. It goes
 * stale silently, and it goes stale in the direction that flatters the demo.
 */
const INSTANCE_FLOATS = blendShader.layout.attributes
  .filter((entry) => entry.divisor === 1)
  .reduce((total, entry) => total + entry.size, 0);

interface SideStats {
  fps: number;
  ms: number;
  /** Milliseconds the CPU spends sorting sprites each frame. */
  sortMs: number;
  /** Instance bytes sent to the GPU each frame. */
  bytes: number;
}

const ZERO: SideStats = { fps: 0, ms: 0, sortMs: 0, bytes: 0 };

/**
 * The same forest, drawn two ways, side by side on one screen.
 *
 * Left: the program blends alpha. A part-transparent fragment has no single
 * depth, so the program cannot write depth. Nothing on the GPU knows which tree
 * is in front. The CPU must sort every sprite each frame and send all of the
 * instance data again.
 *
 * Right: the program calls `discard()` on almost-clear pixels. Every pixel that
 * remains is opaque, so the program writes depth. The depth buffer puts the trees
 * in order, per pixel. The CPU sorts nothing and sends the instance data one time.
 *
 * Both sides run the same scene, the same camera path and the same batch code.
 * The only difference is the technique. That is why the two shader files are worth
 * a diff: the whole difference is three lines in the fragment stage.
 *
 * The two halves each get their own renderer. A texture belongs to the renderer
 * that made it, so each half loads the atlas for itself.
 */
export default function SpriteSplitDemo() {
  const leftCanvas = useRef<HTMLCanvasElement>(null);
  const rightCanvas = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const [left, setLeft] = useState<SideStats>(ZERO);
  const [right, setRight] = useState<SideStats>(ZERO);
  const [sprites, setSprites] = useState(0);
  const leftFrames = useFrameStats();
  const rightFrames = useFrameStats();

  useEffect(() => {
    const leftEl = leftCanvas.current;
    const rightEl = rightCanvas.current;
    if (leftEl === null || rightEl === null) return;
    let cancelled = false;
    const stops: (() => void)[] = [];

    const buildSide = async (
      canvas: HTMLCanvasElement,
      mode: 'blend' | 'cutout',
      tick: (t: number) => void,
      report: (stats: SideStats) => void,
    ): Promise<() => void> => {
      const renderer = await createRenderer(canvas, { clearColor: [0.53, 0.75, 0.85, 1] });
      setBackend(renderer.backend);

      const atlasTexture = await loadTexture(renderer, '/sprites/tiny-town.png', {
        filter: 'nearest',
        wrap: 'clamp',
      });
      const atlas = spriteAtlas(atlasTexture, { cols: 12, rows: 11, tileWidth: 16, tileHeight: 16 });

      // The ground is opaque on both sides. Only the plants differ.
      const groundProgram: BlendProgram = createProgram(renderer, blendShader);
      let spriteProgram: BlendProgram;
      if (mode === 'cutout') {
        const cutout = createProgram(renderer, cutoutShader, { blend: 'alpha', depthWrite: true });
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
      const groundBatch = new SpriteBatch(atlas, scene.ground.length);
      for (const tile of scene.ground) {
        groundBatch.push({ x: tile.x, y: 0, z: tile.z, width: 1, height: 1, tile: tile.tile });
      }
      const spriteBatch = new SpriteBatch(atlas, scene.plants.length);
      for (const plant of scene.plants) {
        spriteBatch.push({
          x: plant.x,
          y: plant.size / 2,
          z: plant.z,
          width: plant.size,
          height: plant.size,
          tile: plant.tile,
          tint: plant.tint,
        });
      }
      const groundCount = uploadSpriteBatch(groundProgram, groundBatch);
      uploadSpriteBatch(spriteProgram, spriteBatch);
      setSprites(spriteBatch.count);

      const camera = createCamera({ fovY: Math.PI / 3.4, near: 0.5, far: 200 });
      const right3 = new Float32Array(3);
      const up3 = new Float32Array(3);

      let sortAccum = 0;
      let bytesAccum = 0;
      let frames = 0;
      let lastReport = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const { position, target } = orbitCamera(t, scene.extent);
        camera.setPosition(position[0], position[1], position[2]);
        camera.lookAt(target[0], target[1], target[2]);
        const viewProj = camera.viewProjection(renderer.aspect);
        const view = camera.view();

        let sortMs = 0;
        let bytes = 0;
        if (mode === 'blend') {
          // The work the cut-out side does not do. Order every sprite by distance
          // from the camera, then send all of the instance data again.
          const started = performance.now();
          spriteBatch.sort((x, y, z) => {
            const dx = x - position[0];
            const dy = y - position[1];
            const dz = z - position[2];
            return dx * dx + dy * dy + dz * dz;
          });
          sortMs = performance.now() - started;
          uploadSpriteBatch(spriteProgram, spriteBatch);
          bytes = spriteBatch.count * INSTANCE_FLOATS * 4;
        }

        groundProgram.uniforms.uViewProj.set(viewProj);
        groundProgram.uniforms.uRight.set(AXIS_RIGHT);
        groundProgram.uniforms.uUp.set(AXIS_GROUND_UP);
        groundProgram.uniforms.uAtlas.set(atlasTexture);
        groundProgram.draw({ instanceCount: groundCount });

        billboardBasis(view, true, right3, up3);
        spriteProgram.uniforms.uViewProj.set(viewProj);
        spriteProgram.uniforms.uRight.set(right3);
        spriteProgram.uniforms.uUp.set(up3);
        spriteProgram.uniforms.uAtlas.set(atlasTexture);
        spriteProgram.draw({ instanceCount: spriteBatch.count });

        sortAccum += sortMs;
        bytesAccum += bytes;
        frames += 1;
        if (t - lastReport >= 0.5) {
          const divisor = Math.max(frames, 1);
          report({
            fps: Math.round(divisor / Math.max(t - lastReport, 0.001)),
            ms: (Math.max(t - lastReport, 0.001) * 1000) / divisor,
            sortMs: sortAccum / divisor,
            bytes: bytesAccum / divisor,
          });
          sortAccum = 0;
          bytesAccum = 0;
          frames = 0;
          lastReport = t;
        }
      });

      return () => {
        stop();
        groundProgram.dispose();
        spriteProgram.dispose();
        atlasTexture.dispose();
        renderer.destroy();
      };
    };

    void (async () => {
      const stopLeft = await buildSide(leftEl, 'blend', leftFrames.tick, setLeft);
      if (cancelled) {
        stopLeft();
        return;
      }
      stops.push(stopLeft);
      const stopRight = await buildSide(rightEl, 'cutout', rightFrames.tick, setRight);
      if (cancelled) {
        stopRight();
        return;
      }
      stops.push(stopRight);
    })();

    return () => {
      cancelled = true;
      for (const stop of stops) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadKiB = (bytes: number): string =>
    bytes < 1024 ? `${bytes.toFixed(0)} B` : `${(bytes / 1024).toFixed(1)} KiB`;

  return (
    <>
      <div className="split-stage">
        <div className="split-half">
          <canvas ref={leftCanvas} />
          <div className="split-label">
            Blended <span>· sorted on the CPU</span>
          </div>
          <div className="split-stats">
            <strong>
              {left.fps} fps · {left.ms.toFixed(1)} ms
            </strong>
            <br />
            sort <span className="bad">{left.sortMs.toFixed(2)} ms/frame</span> · upload{' '}
            <span className="bad">{uploadKiB(left.bytes)}/frame</span>
            <br />
            depth writes off — order comes from the CPU
          </div>
        </div>
        <div className="split-half">
          <canvas ref={rightCanvas} />
          <div className="split-label">
            Cut-out <span>· ordered by the depth buffer</span>
          </div>
          <div className="split-stats">
            <strong>
              {right.fps} fps · {right.ms.toFixed(1)} ms
            </strong>
            <br />
            sort <span className="good">0.00 ms/frame</span> · upload{' '}
            <span className="good">0 B/frame</span>
            <br />
            depth writes on — order comes from the GPU
          </div>
        </div>
      </div>

      <div className="panels">
        <div className="panel">
          <h1>Blended vs cut-out</h1>
          <p className="panel-note">
            The same {sprites.toLocaleString()} trees, drawn two ways at once. Watch the numbers at
            the bottom of each half.
          </p>
          <p className="panel-note">
            <strong>Left</strong> blends transparent edges. A half-clear pixel has no single depth,
            so the program is not allowed to write depth, and nothing on the GPU knows which tree is
            in front. The CPU has to sort all {sprites.toLocaleString()} sprites every frame and send
            them again.
          </p>
          <p className="panel-note">
            <strong>Right</strong> throws away the clear pixels with <code>discard()</code> instead.
            Every pixel that remains is solid, so the program writes depth and the GPU does the
            ordering. Nothing is sorted, and the sprites were sent once.
          </p>
        </div>

        <div className="panel">
          <h1>What BroMetal needed</h1>
          <p className="panel-note">
            Two things, and the right half is impossible without them:{' '}
            <code>discard()</code> in the shader language, and{' '}
            <code>{'createProgram(..., { depthWrite: true })'}</code>. Before, any blend mode turned
            depth writes off with no way to ask for them back.
          </p>
          <p className="panel-note">
            See stats for differences in renderings.
          </p>
          <p className="panel-note">
            <DemoCredit /> · Sprites: Tiny Town by{' '}
            <a href="https://kenney.nl/assets/tiny-town">Kenney</a> (CC0)
          </p>
        </div>
      </div>

      <BackendBadge backend={backend} />
    </>
  );
}
