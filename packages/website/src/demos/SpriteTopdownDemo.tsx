'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createProgram,
  createRenderer,
  loadTexture,
  mat4,
  type BroMetalProgram,
  type RendererBackend,
} from 'brometal';
import cutoutShader from '@/lib/sprite-lib/shaders/sprite-cutout.shader.gen';
import {
  AXIS_RIGHT,
  AXIS_UP,
  LAYER,
  QUAD_INDICES,
  QUAD_POSITIONS,
  QUAD_UVS,
  SpriteBatch,
  ortho2d,
  spriteAtlas,
} from '@/lib/sprite-lib/sprites';
import { buildDungeon, DUNGEON_TILES, type Dungeon } from '@/lib/sprite-lib/dungeon';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import DemoCredit from '@/lib/sprite-lib/DemoCredit';

type CutoutProgram = BroMetalProgram<
  (typeof cutoutShader)['attributes'],
  (typeof cutoutShader)['instanceAttributes'],
  (typeof cutoutShader)['uniforms']
>;

/** World units of map height on screen. */
const VIEW_HEIGHT = 17;
const HERO_SPEED = 4.6;

interface Actor {
  x: number;
  y: number;
  tile: number;
  /** Patrol waypoints, walked in a loop. */
  path: readonly [number, number][];
  leg: number;
  speed: number;
  flip: boolean;
}

/**
 * Top-down 2D on an orthographic camera.
 *
 * Everything — floor, walls, props, torch flames, hero, monsters — is one
 * instanced draw call into one atlas. That works because cut-out sprites write
 * depth: layering is a Z value per sprite rather than a submission order, and
 * the actors get classic y-sorting (things lower on screen overlap things above)
 * from `LAYER.actor` plus a tiny depth nudge derived from their Y. No CPU sort.
 */
export default function SpriteTopdownDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [sprites, setSprites] = useState(0);
  const keysRef = useRef(new Set<string>());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const onKeyDown = (event: KeyboardEvent): void => {
      keysRef.current.add(event.key.toLowerCase());
      if (MOVEMENT_KEYS.has(event.key.toLowerCase())) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      keysRef.current.delete(event.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    void (async () => {
      const renderer = await createRenderer(canvas, { clearColor: [0.05, 0.04, 0.07, 1] });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const atlasTexture = await loadTexture(renderer, '/sprites/tiny-dungeon.png', {
        filter: 'nearest',
        wrap: 'clamp',
      });
      if (cancelled) {
        atlasTexture.dispose();
        renderer.destroy();
        return;
      }
      const atlas = spriteAtlas(atlasTexture, { cols: 12, rows: 11, tileWidth: 16, tileHeight: 16 });

      const program: CutoutProgram = createProgram(renderer, cutoutShader, {
        blend: 'alpha',
        depthWrite: true,
      });
      program.attributes.aPosition.set(QUAD_POSITIONS);
      program.attributes.aUv.set(QUAD_UVS);
      program.setIndices(QUAD_INDICES);
      program.uniforms.uCutoff.set(0.5);

      const dungeon: Dungeon = buildDungeon();
      const batch = new SpriteBatch(atlas, 4096);

      const hero = { x: dungeon.spawn[0], y: dungeon.spawn[1] };
      const monsters: Actor[] = dungeon.patrols.map((patrol, index) => ({
        x: patrol[0]![0],
        y: patrol[0]![1],
        tile: MONSTERS[index % MONSTERS.length]!,
        path: patrol,
        leg: 0,
        speed: 1.5 + (index % 3) * 0.45,
        flip: false,
      }));

      const viewProj = mat4.scratch();
      let last = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const dt = Math.min(Math.max(t - last, 0), 0.05);
        last = t;

        // --- hero movement, blocked by walls ---
        const keys = keysRef.current;
        let dx = 0;
        let dy = 0;
        if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright')) dx += 1;
        if (keys.has('s') || keys.has('arrowdown')) dy -= 1;
        if (keys.has('w') || keys.has('arrowup')) dy += 1;
        if (dx !== 0 || dy !== 0) {
          const inv = 1 / Math.hypot(dx, dy);
          const stepX = dx * inv * HERO_SPEED * dt;
          const stepY = dy * inv * HERO_SPEED * dt;
          if (dungeon.walkable(hero.x + stepX, hero.y)) hero.x += stepX;
          if (dungeon.walkable(hero.x, hero.y + stepY)) hero.y += stepY;
        }
        const heroMoving = dx !== 0 || dy !== 0;
        const heroFlip = dx < 0;

        // --- monsters walk their patrol loops ---
        for (const monster of monsters) {
          const goal = monster.path[monster.leg]!;
          const toX = goal[0] - monster.x;
          const toY = goal[1] - monster.y;
          const distance = Math.hypot(toX, toY);
          if (distance < 0.08) {
            monster.leg = (monster.leg + 1) % monster.path.length;
          } else {
            monster.x += (toX / distance) * monster.speed * dt;
            monster.y += (toY / distance) * monster.speed * dt;
            monster.flip = toX < 0;
          }
        }

        // --- camera follows the hero, clamped to the map ---
        const halfHeight = VIEW_HEIGHT / 2;
        const halfWidth = halfHeight * renderer.aspect;
        const camX = clamp(hero.x, halfWidth, dungeon.width - halfWidth);
        const camY = clamp(hero.y, halfHeight, dungeon.height - halfHeight);
        ortho2d(camX, camY, VIEW_HEIGHT, renderer.aspect, viewProj);

        // --- build the frame's sprite list ---
        batch.clear();

        // Torches flicker, and the floor near one picks up the warmth. Tinting
        // is per instance, so "lighting" here costs nothing but a multiply.
        const flicker = dungeon.torches.map(
          (_, i) => 0.78 + 0.22 * Math.sin(t * (7 + i * 1.7) + i * 2.1) * Math.sin(t * 3.1 + i),
        );

        for (const cell of dungeon.cells) {
          let r = 0.3;
          let g = 0.29;
          let b = 0.4;
          for (let i = 0; i < dungeon.torches.length; i++) {
            const torch = dungeon.torches[i]!;
            const d2 = (cell.x - torch[0]) ** 2 + (cell.y - torch[1]) ** 2;
            // Quadratic falloff over ~4 tiles, squared again so the pool has a
            // soft edge instead of a hard disc.
            const fall = Math.max(0, 1 - d2 / 18) ** 2 * flicker[i]!;
            r += fall * 0.85;
            g += fall * 0.5;
            b += fall * 0.2;
          }
          batch.push({
            x: cell.x,
            y: cell.y,
            z: cell.wall ? LAYER.decor : LAYER.floor,
            width: 1,
            height: 1,
            tile: cell.tile,
            tint: [Math.min(r, 1.15), Math.min(g, 1.05), Math.min(b, 1)],
          });
        }

        for (const prop of dungeon.props) {
          batch.push({
            x: prop.x,
            y: prop.y,
            z: LAYER.item,
            width: 1,
            height: 1,
            tile: prop.tile,
            tint: [0.95, 0.92, 0.88],
          });
        }

        for (let i = 0; i < dungeon.torches.length; i++) {
          const torch = dungeon.torches[i]!;
          const f = flicker[i]!;
          batch.push({
            x: torch[0],
            y: torch[1],
            z: LAYER.decor + 0.01,
            width: 1,
            height: 1,
            tile: DUNGEON_TILES.torch,
            tint: [1, 0.85 + f * 0.15, 0.6 + f * 0.2],
          });
        }

        for (const monster of monsters) {
          batch.push({
            x: monster.x,
            y: monster.y + Math.abs(Math.sin(t * 6 + monster.x)) * 0.09,
            z: depthForY(monster.y, dungeon.height),
            width: 1,
            height: 1,
            tile: monster.tile,
            flipX: monster.flip,
            tint: [0.95, 0.95, 1],
          });
        }

        batch.push({
          x: hero.x,
          // A bob while walking is the whole animation — Tiny Dungeon has one
          // frame per character, so motion has to come from the transform.
          y: hero.y + (heroMoving ? Math.abs(Math.sin(t * 11)) * 0.12 : 0),
          z: depthForY(hero.y, dungeon.height),
          width: 1,
          height: 1,
          tile: DUNGEON_TILES.hero,
          flipX: heroFlip,
        });

        program.uniforms.uViewProj.set(viewProj);
        program.uniforms.uRight.set(AXIS_RIGHT);
        program.uniforms.uUp.set(AXIS_UP);
        program.uniforms.uAtlas.set(atlasTexture);
        program.instanceAttributes.iCenter.set(batch.centers);
        program.instanceAttributes.iSize.set(batch.sizes);
        program.instanceAttributes.iUvRect.set(batch.uvRects);
        program.instanceAttributes.iTint.set(batch.tints);
        program.draw({ instanceCount: batch.count });

        if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
          setSprites(batch.count);
        }
      });

      cleanup = () => {
        stop();
        program.dispose();
        atlasTexture.dispose();
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [tick]);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>2D Top-down</h1>
          <p>
            <strong>WASD</strong> or the <strong>arrow keys</strong> to walk. The camera follows and
            clamps to the map edges.
          </p>
          <p>
            One atlas, one instanced draw call for the entire scene — floor, walls, crates, torch
            flames, monsters, hero. Layering is a Z per sprite instead of a submission order,
            because cut-out sprites write depth. Actors get classic y-sorting from that same depth
            value, so a monster below the hero overlaps him with no CPU sort anywhere.
          </p>
          <p>
            Torchlight is a per-instance tint: distance falloff summed on the CPU into the{' '}
            <code>iTint</code> attribute. There is no lighting pass.
          </p>
        </div>
      </div>
      <DemoStats stats={stats}>
        {sprites} sprites · 1 draw call · depth-layered, no sort
        <br />
        <DemoCredit />
        <br />
        Sprites: Tiny Dungeon by <a href="https://kenney.nl/assets/tiny-dungeon">Kenney</a> (CC0)
      </DemoStats>
      <BackendBadge backend={backend} />
    </>
  );
}

const MOVEMENT_KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
]);

const MONSTERS = [
  DUNGEON_TILES.ghost,
  DUNGEON_TILES.spider,
  DUNGEON_TILES.imp,
  DUNGEON_TILES.wraith,
] as const;

function clamp(value: number, low: number, high: number): number {
  return high < low ? (low + high) / 2 : Math.min(Math.max(value, low), high);
}

/**
 * Actors share one layer band but are separated inside it by Y, so lower-on-
 * screen draws in front. The band is small enough never to reach the next layer.
 */
function depthForY(y: number, mapHeight: number): number {
  return LAYER.actor + (1 - y / mapHeight) * 0.05;
}
