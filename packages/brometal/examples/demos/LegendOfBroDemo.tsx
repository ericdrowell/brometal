'use client';

import { useEffect, useRef } from 'react';
import {
  createProgram,
  createRenderer,
  createTexture,
  type BroMetalProgram,
  type Renderer,
} from 'brometal';
import spriteShader from '../shaders/legend-of-bro.shader.gen';
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

type SpriteProgram = BroMetalProgram<
  (typeof spriteShader)['attributes'],
  (typeof spriteShader)['instanceAttributes'],
  (typeof spriteShader)['uniforms']
>;

/** How many tiles fit vertically. Wider screens see more world, not bigger tiles. */
const VIEW_TILES_Y = 15;

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
 * Orthographic projection, in tiles, with +y pointing down.
 *
 * Column-major to match the rest of the library. There is no `mat4.orthographic`
 * — every other example is perspective — so this is sixteen floats written out.
 * The y scale is negated because a tilemap is authored top-down while clip space
 * is not; doing it here means nothing else in the demo has to remember.
 */
function ortho(cx: number, cy: number, halfW: number, halfH: number, out: Float32Array): Float32Array {
  out.fill(0);
  out[0] = 1 / halfW;
  out[5] = -1 / halfH;
  out[10] = 1;
  out[12] = -cx / halfW;
  out[13] = cy / halfH;
  out[15] = 1;
  return out;
}

export default function LegendOfBroDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats, tick } = useFrameStats();
  const { error, report, dismiss } = useBroMetalError();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const held = new Set<string>();
    const down = (e: KeyboardEvent) => {
      held.add(e.key.toLowerCase());
      if (e.key.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => held.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up);

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

      const quad = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
      const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);
      const cellUv: [number, number] = [1 / ATLAS_COLS, 1 / ATLAS_ROWS];
      for (const program of [ground, actors]) {
        program.attributes.aCorner.set(quad);
        program.setIndices(quadIndices);
        program.uniforms.uAtlas.set(atlas);
        program.uniforms.uCell.set(cellUv);
      }

      // Ground: one instance per tile, uploaded once.
      const tiles = MAP_W * MAP_H;
      const gPos = new Float32Array(tiles * 2);
      const gCell = new Float32Array(tiles * 2);
      const gSize = new Float32Array(tiles * 2).fill(1);
      for (let y = 0; y < MAP_H; y += 1) {
        for (let x = 0; x < MAP_W; x += 1) {
          const i = y * MAP_W + x;
          gPos[i * 2] = x;
          gPos[i * 2 + 1] = y;
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

      const stop = renderer.loop((t) => {
        tick(t);
        const dt = Math.min(t - last, 0.05);
        last = t;

        const dx = (held.has('arrowright') || held.has('d') ? 1 : 0) - (held.has('arrowleft') || held.has('a') ? 1 : 0);
        const dy = (held.has('arrowdown') || held.has('s') ? 1 : 0) - (held.has('arrowup') || held.has('w') ? 1 : 0);
        moveActor(hero, dx, dy, dt);
        for (const m of monsters) wander(m, dt, random);

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
          aPos[i * 2] = o.x;
          aPos[i * 2 + 1] = o.y;
          aCell[i * 2] = o.cx;
          aCell[i * 2 + 1] = o.cy;
          aSize[i * 2] = o.w;
          aSize[i * 2 + 1] = o.h;
        }
        actors.instanceAttributes.iPos.set(aPos);
        actors.instanceAttributes.iCell.set(aCell);
        actors.instanceAttributes.iSize.set(aSize);

        // Camera follows, but stops at the edges so the level never shows its
        // border. On a map narrower than the view it centres instead.
        const halfH = VIEW_TILES_Y / 2;
        const halfW = halfH * renderer.aspect;
        const cx = MAP_W <= halfW * 2 ? MAP_W / 2 : Math.min(Math.max(hero.x + 0.5, halfW), MAP_W - halfW);
        const cy = MAP_H <= halfH * 2 ? MAP_H / 2 : Math.min(Math.max(hero.y + 0.5, halfH), MAP_H - halfH);
        ortho(cx, cy, halfW, halfH, viewProj);

        for (const program of [ground, actors]) program.uniforms.uViewProj.set(viewProj);
        ground.draw();
        actors.draw();
      });

      cleanup = () => {
        stop();
        ground.dispose();
        actors.dispose();
        renderer.destroy();
      };
    })().catch(report);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      cleanup?.();
    };
  }, [report]);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <ErrorToast error={error} onDismiss={dismiss} />
      <DemoStats stats={stats}>
        <strong>Arrows / WASD</strong> to walk · {MAP_W * MAP_H} ground tiles and{' '}
        {PROPS.length + 8} sprites in two draw calls
      </DemoStats>
    </>
  );
}
