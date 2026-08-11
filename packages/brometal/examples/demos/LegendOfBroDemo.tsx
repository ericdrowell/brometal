'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createProgram,
  createRenderTarget,
  createRenderer,
  createTexture,
  type RenderTarget,
} from 'brometal';
import spriteShader from '../shaders/legend-of-bro.shader.gen';
import presentShader from '../shaders/legend-of-bro-present.shader.gen';
import irisShader from '../shaders/legend-of-bro-iris.shader.gen';
import DemoStats, { useFrameStats } from './_site/DemoStats';
import ErrorToast, { useBroMetalError } from './_site/ErrorToast';
import {
  ATLAS_BLITS,
  ATLAS_COLS,
  ATLAS_ROWS,
  MAP_H,
  MAP_W,
  PROPS,
  SHEETS,
  TILE,
  createHero,
  createMonsters,
  groundCell,
  moveActor,
  seededRandom,
  walkFrame,
  wander,
  type Actor,
  type SheetName,
} from '@/lib/legend-of-bro';

/**
 * Art pixels the scene aims to be tall, before the integer upscale.
 *
 * 224 is fourteen tiles — a hair under the SNES's 224-line NTSC frame, which is
 * what this art was drawn for. The actual target is whatever whole-number scale
 * fits the canvas nearest to this, so a taller window sees a little more world
 * rather than the same world at a blurrier size.
 */
const BASE_HEIGHT = 224;

/** Iris radius, in art pixels, when the game is paused — a porthole on the hero. */
const IRIS_CLOSED = 30;

/** Seconds for the wipe to run either way. */
const IRIS_TIME = 0.5;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/**
 * Composites the five source sheets into the one atlas the shader samples.
 *
 * `imageSmoothingEnabled = false` matters even here: the blits are 1:1 so
 * nothing should resample, but a browser that decides otherwise softens every
 * edge in the tileset and the result looks like a blurry upscale rather than
 * pixel art.
 */
function buildAtlas(sheets: Record<SheetName, HTMLImageElement>): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE;
  canvas.height = ATLAS_ROWS * TILE;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  for (const b of ATLAS_BLITS) {
    ctx.drawImage(
      sheets[b.sheet],
      b.sx * TILE,
      b.sy * TILE,
      b.w * TILE,
      b.h * TILE,
      b.ax * TILE,
      b.ay * TILE,
      b.w * TILE,
      b.h * TILE,
    );
  }
  return canvas;
}

/**
 * Orthographic projection mapping art pixels 1:1 onto the target, +y down.
 *
 * `left`/`top` are the world pixel at the target's top-left corner, and both are
 * whole numbers. That is the whole trick: an integer camera offset applied to
 * integer sprite positions leaves an integer result, so every sprite lands
 * exactly on a texel. Let either one go fractional and the art crawls.
 *
 * Column-major to match the rest of the library. There is no `mat4.orthographic`
 * — every other example is perspective — so this is sixteen floats written out.
 */
function ortho(left: number, top: number, w: number, h: number, out: Float32Array): Float32Array {
  out.fill(0);
  out[0] = 2 / w;
  out[5] = -2 / h;
  out[10] = 1;
  out[12] = (-2 * left) / w - 1;
  out[13] = (2 * top) / h + 1;
  out[15] = 1;
  return out;
}

export default function LegendOfBroDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats, tick } = useFrameStats();
  const { error, report, dismiss } = useBroMetalError();
  const [playing, setPlaying] = useState(false);
  // The loop reads this rather than `playing`: state would have to be a
  // dependency of the effect, and re-running the effect rebuilds the renderer.
  const playingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const held = new Set<string>();
    const start = () => {
      playingRef.current = true;
      setPlaying(true);
    };
    const pause = () => {
      playingRef.current = false;
      setPlaying(false);
      // Drop every held key, or a direction still down at the moment of pausing
      // resumes as a character walking on their own.
      held.clear();
    };
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pause();
        return;
      }
      // Any other key resumes. There is no panel telling you to click any more,
      // so the first thing a visitor tries — an arrow key — has to be what
      // starts it, and that same press should also move the hero.
      if (!playingRef.current) start();
      held.add(e.key.toLowerCase());
      if (e.key.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => held.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up);
    canvas.addEventListener('pointerdown', start);

    void (async () => {
      const names = Object.keys(SHEETS) as SheetName[];
      const images = await Promise.all(names.map((n) => loadImage(SHEETS[n])));
      const sheets = Object.fromEntries(names.map((n, i) => [n, images[i]!])) as Record<
        SheetName,
        HTMLImageElement
      >;
      if (cancelled) return;

      const renderer = await createRenderer(canvas, {
        onError: report,
        clearColor: [0.05, 0.09, 0.05, 1],
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }

      // Nearest filtering, or 16px art turns to mush the moment it is scaled up.
      // clamp, so a cell on the atlas edge cannot wrap and sample its opposite.
      const atlas = createTexture(renderer, buildAtlas(sheets), {
        filter: 'nearest',
        flipY: false,
        wrap: 'clamp',
      });

      // Two programs, one shader. The ground never changes, so its instance
      // buffer is written once; everything that overlaps has to be re-sorted
      // every frame and gets its own.
      const ground = createProgram(renderer, spriteShader, { blend: 'alpha' });
      const actors = createProgram(renderer, spriteShader, { blend: 'alpha' });
      const present = createProgram(renderer, presentShader);
      // Alpha-blended, and drawn into the target after the scene: it paints
      // black over what the iris hides and nothing over what it shows.
      const iris = createProgram(renderer, irisShader, { blend: 'alpha' });

      const quad = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
      const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);
      const cellUv: [number, number] = [1 / ATLAS_COLS, 1 / ATLAS_ROWS];
      for (const program of [ground, actors]) {
        program.attributes.aCorner.set(quad);
        program.setIndices(quadIndices);
        program.uniforms.uAtlas.set(atlas);
        program.uniforms.uCell.set(cellUv);
        program.uniforms.uTile.set(TILE);
      }
      for (const program of [present, iris]) {
        program.attributes.aCorner.set(quad);
        program.setIndices(quadIndices);
      }

      // The scene target, resized whenever the canvas is. Its dimensions are art
      // pixels, so the scale below is always a whole number.
      let scene: RenderTarget | null = null;
      let sceneW = 0;
      let sceneH = 0;
      let scale = 1;
      const sizeScene = (): RenderTarget => {
        const cw = renderer.canvas.width;
        const ch = renderer.canvas.height;
        scale = Math.max(1, Math.round(ch / BASE_HEIGHT));
        const w = Math.max(2, Math.ceil(cw / scale));
        const h = Math.max(2, Math.ceil(ch / scale));
        if (scene === null || w !== sceneW || h !== sceneH) {
          scene?.dispose();
          scene = createRenderTarget(renderer, { width: w, height: h });
          sceneW = w;
          sceneH = h;
          present.uniforms.uScene.set(scene.texture);
        }
        return scene;
      };

      // Ground: one instance per tile, uploaded once.
      const tiles = MAP_W * MAP_H;
      const gPos = new Float32Array(tiles * 2);
      const gCell = new Float32Array(tiles * 2);
      const gSize = new Float32Array(tiles * 2).fill(1);
      for (let y = 0; y < MAP_H; y += 1) {
        for (let x = 0; x < MAP_W; x += 1) {
          const i = y * MAP_W + x;
          gPos[i * 2] = x * TILE;
          gPos[i * 2 + 1] = y * TILE;
          const cell = groundCell(x, y);
          gCell[i * 2] = cell[0];
          gCell[i * 2 + 1] = cell[1];
        }
      }
      ground.instanceAttributes.iPos.set(gPos);
      ground.instanceAttributes.iCell.set(gCell);
      ground.instanceAttributes.iSize.set(gSize);

      const hero = createHero();
      const monsters = createMonsters();
      const random = seededRandom(0xb20);

      // Props and actors share one buffer because they have to share one sort:
      // the hero walking behind a tree and in front of a rock is the same
      // comparison, so they cannot be separate draws.
      const drawable = PROPS.length + 1 + monsters.length;
      const aPos = new Float32Array(drawable * 2);
      const aCell = new Float32Array(drawable * 2);
      const aSize = new Float32Array(drawable * 2);
      const order: { x: number; y: number; w: number; h: number; cx: number; cy: number }[] = [];

      const viewProj = new Float32Array(16);
      let last = 0;
      // 0 = closed on the hero, 1 = wide open. Eased every frame regardless of
      // whether the game is running, or pausing would freeze the wipe halfway.
      let open = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const dt = Math.min(t - last, 0.05);
        last = t;

        // Paused still draws — the world sits there behind the panel rather than
        // going black — it just stops advancing.
        if (playingRef.current) {
          const dx =
            (held.has('arrowright') || held.has('d') ? 1 : 0) -
            (held.has('arrowleft') || held.has('a') ? 1 : 0);
          const dy =
            (held.has('arrowdown') || held.has('s') ? 1 : 0) -
            (held.has('arrowup') || held.has('w') ? 1 : 0);
          moveActor(hero, dx, dy, dt);
          for (const m of monsters) wander(m, dt, random);
        }

        order.length = 0;
        for (const p of PROPS) {
          order.push({ x: p.x, y: p.y, w: p.w, h: p.h, cx: p.cell[0], cy: p.cell[1] });
        }
        for (const a of [hero, ...monsters] as Actor[]) {
          order.push({
            x: a.x,
            y: a.y,
            w: 1,
            h: 1,
            cx: a.cell[0] + a.facing,
            cy: a.cell[1] + walkFrame(a),
          });
        }
        // Painter's order by the bottom edge: whatever stands lower on the screen
        // is nearer the camera and draws last. Blended programs do not write
        // depth, so this sort *is* the depth buffer.
        order.sort((p, q) => p.y + p.h - (q.y + q.h));
        for (let i = 0; i < order.length; i += 1) {
          const o = order[i]!;
          // Snapped here, once, rather than anywhere upstream: movement and
          // collision stay smooth in fractional tiles, and only what reaches the
          // GPU is quantised. Rounding the simulation instead would make the
          // hero move in visible 16th-of-a-tile jerks.
          aPos[i * 2] = Math.round(o.x * TILE);
          aPos[i * 2 + 1] = Math.round(o.y * TILE);
          aCell[i * 2] = o.cx;
          aCell[i * 2 + 1] = o.cy;
          aSize[i * 2] = o.w;
          aSize[i * 2 + 1] = o.h;
        }
        actors.instanceAttributes.iPos.set(aPos);
        actors.instanceAttributes.iCell.set(aCell);
        actors.instanceAttributes.iSize.set(aSize);

        const target = sizeScene();

        // Camera follows, but stops at the edges so the level never shows its
        // border. On a map smaller than the view it centres instead. Rounded to
        // a whole pixel for the same reason the sprites are.
        const worldW = MAP_W * TILE;
        const worldH = MAP_H * TILE;
        const focusX = hero.x * TILE + TILE / 2 - target.width / 2;
        const focusY = hero.y * TILE + TILE / 2 - target.height / 2;
        const left =
          worldW <= target.width
            ? Math.round((worldW - target.width) / 2)
            : Math.round(Math.min(Math.max(focusX, 0), worldW - target.width));
        const top =
          worldH <= target.height
            ? Math.round((worldH - target.height) / 2)
            : Math.round(Math.min(Math.max(focusY, 0), worldH - target.height));
        ortho(left, top, target.width, target.height, viewProj);
        for (const program of [ground, actors]) program.uniforms.uViewProj.set(viewProj);

        // Open when playing, closed when paused, easing between the two.
        open = Math.min(Math.max(open + (playingRef.current ? dt : -dt) / IRIS_TIME, 0), 1);
        // Smoothstep, so the wipe leaves and arrives gently instead of starting
        // at full speed and stopping dead.
        const eased = open * open * (3 - 2 * open);
        // Far enough to clear the corners from wherever the hero stands, so a
        // fully open iris has no dithered edge anywhere on screen.
        const reach = Math.hypot(target.width, target.height) + 40;
        const heroPx = Math.round(hero.x * TILE + TILE / 2) - left;
        const heroPy = Math.round(hero.y * TILE + TILE / 2) - top;
        iris.uniforms.uScenePx.set([target.width, target.height]);
        iris.uniforms.uCenter.set([heroPx / target.width, heroPy / target.height]);
        iris.uniforms.uRadius.set(IRIS_CLOSED + (reach - IRIS_CLOSED) * eased);

        // Pass one: the whole scene at art resolution, one texel per pixel, with
        // the iris dithered in on top of it — still at art resolution.
        renderer.drawTo(
          target,
          () => {
            ground.draw();
            actors.draw();
            iris.draw();
          },
          { clear: [0.05, 0.09, 0.05, 1] },
        );

        // Pass two: blow the finished frame up by a whole number.
        present.uniforms.uFill.set([
          (target.width * scale) / renderer.canvas.width,
          (target.height * scale) / renderer.canvas.height,
        ]);
        present.draw();
      });

      cleanup = () => {
        stop();
        ground.dispose();
        actors.dispose();
        present.dispose();
        iris.dispose();
        scene?.dispose();
        renderer.destroy();
      };
    })().catch(report);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      canvas.removeEventListener('pointerdown', start);
      cleanup?.();
    };
  }, [report]);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Legend of Bro</h1>
          <p className="panel-note">
            A tilemap and every animated sprite drawn from one atlas in two
            instanced draw calls. The scene renders at art resolution — one texel
            per pixel of the tileset — then scales up by a whole number, so every
            pixel stays square and the dithered wipe lands on the same grid.
          </p>
          <h2>Controls</h2>
          <p className="panel-note">
            Arrows or WASD to walk · Esc to pause · any key or a click resumes.
            Trees, rocks and bushes block you; the slimes and bats do not.
          </p>
          <h2>Credits</h2>
          <p className="panel-note">
            Art from{' '}
            <a
              href="https://pixel-boy.itch.io/ninja-adventure-asset-pack"
              target="_blank"
              rel="noreferrer"
            >
              Ninja Adventure
            </a>{' '}
            by Pixel-boy &amp; AAA — CC0.
          </p>
        </div>
      </div>
      <ErrorToast error={error} onDismiss={dismiss} />
      <DemoStats stats={stats}>
        {MAP_W * MAP_H} ground tiles and {PROPS.length + 8} sprites in two draw calls
      </DemoStats>
    </>
  );
}
