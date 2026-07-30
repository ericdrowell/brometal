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
import blendShader from '@/shaders/sprite-blend.shader.gen';
import cutoutShader from '@/shaders/sprite-cutout.shader.gen';
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
} from '@/lib/sprites';
import BackendBadge from '@/components/BackendBadge';
import { useFrameStats } from '@/components/DemoStats';
import DemoCredit from '@/components/DemoCredit';

// ---------------------------------------------------------------------------
// Inlined from what used to be sprite-scene.ts. It had one caller, so it lives
// here rather than in a shared module.
// ---------------------------------------------------------------------------

/**
 * The scene both sprite demos draw. Shared so the cut-out page and the blended
 * page differ *only* in how they draw it — same sprites, same positions, same
 * camera path, same atlas.
 *
 * Deliberately built to be hostile to the blended technique: the trees are
 * dense enough to overlap constantly, and `FOLIAGE` places clumps close enough
 * together that their quads interpenetrate. Sorting picks one order per sprite,
 * which is the wrong answer for two quads that cross.
 */

/** Tile indices in public/sprites/tiny-town.png (12 x 11 grid of 16px tiles). */
const TOWN_TILES = {
  /** Plain, tufted, and flowered grass. */
  grass: [0, 1, 2] as const,
  /** Grass with grey stones — sprinkled in for variety. */
  grassPatch: 43,
  /** Round-canopy and conifer trees, orange and green. */
  trees: [15, 16, 27, 28] as const,
  /** A round bush and a leafy sprig. */
  bushes: [5, 17] as const,
  mushrooms: 29,
} as const;

interface ScenePlant {
  x: number;
  z: number;
  /** World height of the quad; width follows from the tile being square. */
  size: number;
  tile: number;
  tint: readonly [number, number, number];
}

interface SceneGroundTile {
  x: number;
  z: number;
  tile: number;
}

interface SpriteScene {
  ground: SceneGroundTile[];
  plants: ScenePlant[];
  /** Half-width of the ground in world units. */
  extent: number;
}

/**
 * Deterministic PRNG so the two demos are pixel-comparable and a reload does
 * not reshuffle the forest. Mulberry32.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUND_TILES_PER_SIDE = 32;
/** World size of one ground tile. */
const TILE_SIZE = 1;

function buildSpriteScene(clumps = 90): SpriteScene {
  const random = rng(0x5eed);
  const extent = (GROUND_TILES_PER_SIDE * TILE_SIZE) / 2;

  const ground: SceneGroundTile[] = [];
  for (let iz = 0; iz < GROUND_TILES_PER_SIDE; iz++) {
    for (let ix = 0; ix < GROUND_TILES_PER_SIDE; ix++) {
      const x = -extent + (ix + 0.5) * TILE_SIZE;
      const z = -extent + (iz + 0.5) * TILE_SIZE;
      const roll = random();
      const tile =
        roll > 0.93
          ? TOWN_TILES.grassPatch
          : TOWN_TILES.grass[Math.floor(random() * TOWN_TILES.grass.length)]!;
      ground.push({ x, z, tile });
    }
  }

  // Clumps rather than a uniform scatter: overlapping quads are the interesting
  // case, and a clump guarantees several per screen wherever the camera looks.
  const plants: ScenePlant[] = [];
  for (let c = 0; c < clumps; c++) {
    const cx = (random() * 2 - 1) * (extent - 2);
    const cz = (random() * 2 - 1) * (extent - 2);
    const members = 3 + Math.floor(random() * 4);
    for (let m = 0; m < members; m++) {
      const angle = random() * Math.PI * 2;
      const radius = random() * 1.4;
      const isTree = random() > 0.42;
      const size = isTree ? 1.7 + random() * 1.1 : 0.75 + random() * 0.4;
      const pool = isTree ? TOWN_TILES.trees : TOWN_TILES.bushes;
      // A slight brightness jitter keeps a wall of identical trees from reading
      // as a texture bug rather than a forest.
      const shade = 0.84 + random() * 0.32;
      plants.push({
        x: cx + Math.cos(angle) * radius,
        z: cz + Math.sin(angle) * radius,
        size,
        tile: pool[Math.floor(random() * pool.length)]!,
        tint: [shade, shade * 1.02, shade * 0.97],
      });
    }
    if (random() > 0.55) {
      plants.push({
        x: cx + (random() * 2 - 1) * 1.6,
        z: cz + (random() * 2 - 1) * 1.6,
        size: 0.5,
        tile: TOWN_TILES.mushrooms,
        tint: [1, 1, 1],
      });
    }
  }

  return { ground, plants, extent };
}

/**
 * Camera path shared by both demos: a slow orbit outside the forest, angled
 * down enough to look like 2.3D but shallow enough that the billboards overlap
 * heavily — overlap is the whole point of the comparison.
 */
function orbitCamera(
  elapsedSeconds: number,
  extent: number,
): { position: [number, number, number]; target: [number, number, number] } {
  const angle = elapsedSeconds * 0.16;
  const radius = extent * 1.35;
  return {
    position: [Math.cos(angle) * radius, 12, Math.sin(angle) * radius],
    target: [0, 1.2, 0],
  };
}


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
        const cutout = createProgram(renderer, cutoutShader, { blend: 'none' });
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
            One thing: <code>discard()</code> in the shader language. Nothing else in the library
            could throw a pixel away, so a sprite with a soft edge had to blend, and a blended
            program cannot write depth.
          </p>
          <p className="panel-note">
            Note what the right half does <em>not</em> need. Its fragment stage returns alpha 1 on
            every pixel that survives, so it is opaque, and an opaque program already wrote depth.
            The only new part is the discard.
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
