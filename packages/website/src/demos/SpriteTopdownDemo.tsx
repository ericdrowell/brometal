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
import dungeonShader from '@/shaders/topdown-dungeon.shader.gen';
import { LAYER, QUAD_INDICES, QUAD_POSITIONS, QUAD_UVS, ortho2d } from '@/lib/sprites';
import { createDataTexture, quantizeDistance } from '@/lib/data-texture';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import DemoCredit from '@/components/DemoCredit';

// ---------------------------------------------------------------------------
// Inlined from what used to be dungeon.ts. It had one caller, so it lives
// here rather than in a shared module.
// ---------------------------------------------------------------------------

/**
 * A small room-and-corridor dungeon for the top-down demo.
 *
 * Deliberately plain: rectangles joined by L-shaped corridors, walls stamped
 * wherever a floor cell borders solid rock. The interesting part of the demo is
 * how the sprites are *drawn*, not the generator.
 *
 * The output is shaped for a GPU that reads the level itself. Instead of a list
 * of cell objects the demo has to walk every frame, the grid is two parallel
 * byte arrays that go straight into an RGBA8 data texture, and everything else
 * (props, torches, patrols) is a grid coordinate — so the whole level uploads
 * once and the vertex shader looks up its own cell from then on.
 *
 * The generator stays on the CPU. It is a global, sequential algorithm — each
 * room tested against all previous, each corridor joining consecutive centres —
 * so it is not a function of position, and `walkable()` is gameplay: with no
 * GPU-to-CPU readback, the answer has to exist here regardless.
 */

/** Tile indices in public/sprites/tiny-dungeon.png (12 x 11 grid of 16px tiles). */
const DUNGEON_TILES = {
  floor: [48, 49, 50, 51] as const,
  floorWorn: [52, 53] as const,
  /**
   * The wall tiles are a run set. Each tile has a dark border on the sides that
   * the artist drew as exposed masonry:
   *
   *   wallBoth  (58) has a border on the left and the right.
   *   wallLeft  (57) has a border on the left only.
   *   wallRight (59) has a border on the right only.
   *   wallMid   (40) has no side border.
   *   wallVent  (28) has no side border. It shows a barred vent.
   *
   * Select the tile from the neighbour cells. Do not select it at random. A random
   * selection puts a border in the middle of a wall. Then the wall looks like
   * many separate blocks.
   */
  wallBoth: 58,
  wallLeft: 57,
  wallRight: 59,
  wallMid: 40,
  wallVent: 28,
  torch: 29,
  crate: 63,
  table: 72,
  stool: 73,
  chest: 89,
  chestOpen: 90,
  potion: 114,
  hero: 84,
  ghost: 108,
  wraith: 121,
  spider: 122,
  imp: 110,
} as const;

/** What stands in a grid slot. Matches the `kind` byte the shader decodes. */
const CELL = { empty: 0, floor: 1, wall: 2 } as const;

/** A prop's grid column and row, not its world centre — the shader adds the half. */
interface DungeonProp {
  x: number;
  y: number;
  tile: number;
}

/**
 * A monster's patrol loop as a rectangle. The CPU used to walk four waypoints
 * and integrate toward the next one; the shader evaluates the perimeter as a
 * closed form of time, which needs no state and so needs no upload.
 */
interface PatrolRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Dungeon {
  width: number;
  height: number;
  /** One byte per grid slot, row-major: a `CELL` value. */
  kinds: Uint8Array;
  /** Atlas tile index per grid slot, row-major. Zero where `kinds` is empty. */
  tiles: Uint8Array;
  /**
   * Slots that actually contain something. The demo compacts to exactly this
   * many terrain instances at load, so nothing degenerate is ever submitted.
   */
  filled: number;
  props: DungeonProp[];
  /** Torch grid cells. Both coordinates fit a byte on a 46 x 34 map. */
  torches: [number, number][];
  patrols: PatrolRect[];
  /** Hero start, in world units. */
  spawn: [number, number];
  /** True where an actor may stand. Takes world coordinates. */
  walkable(x: number, y: number): boolean;
}

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

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WIDTH = 46;
const HEIGHT = 34;

function buildDungeon(): Dungeon {
  const random = rng(0xd0e7);
  const floor: boolean[] = new Array(WIDTH * HEIGHT).fill(false);
  const at = (x: number, y: number): number => y * WIDTH + x;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;

  const rooms: Room[] = [];
  const attempts = 40;
  for (let i = 0; i < attempts && rooms.length < 9; i++) {
    const w = 5 + Math.floor(random() * 7);
    const h = 4 + Math.floor(random() * 6);
    const x = 2 + Math.floor(random() * (WIDTH - w - 4));
    const y = 2 + Math.floor(random() * (HEIGHT - h - 4));
    const candidate = { x, y, w, h };
    // One cell of padding so two rooms never share a wall.
    const clash = rooms.some(
      (room) =>
        x < room.x + room.w + 1 &&
        x + w + 1 > room.x &&
        y < room.y + room.h + 1 &&
        y + h + 1 > room.y,
    );
    if (clash) continue;
    rooms.push(candidate);
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        floor[at(rx, ry)] = true;
      }
    }
  }

  // L-shaped corridors between consecutive room centres.
  for (let i = 1; i < rooms.length; i++) {
    const a = center(rooms[i - 1]!);
    const b = center(rooms[i]!);
    const horizontalFirst = random() > 0.5;
    const corner: [number, number] = horizontalFirst ? [b[0], a[1]] : [a[0], b[1]];
    carveLine(floor, at, a, corner);
    carveLine(floor, at, corner, b);
  }

  // A wall goes in each solid cell that touches a floor cell. The result is one
  // ring around all of the floor.
  //
  // The output is two byte arrays, not a list of cell objects. The only consumer
  // is an RGBA8 data texture. The shader reads one cell of it per instance.
  const kinds = new Uint8Array(WIDTH * HEIGHT);
  const tiles = new Uint8Array(WIDTH * HEIGHT);
  let filled = 0;

  // Pass 1 marks each cell as floor or wall, and gives the floor cells a tile.
  // The wall tiles need a second pass. A wall tile depends on the cells to its
  // left and right, and those cells are not marked yet.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const slot = at(x, y);
      if (floor[slot] === true) {
        const worn = random() > 0.86;
        const pool = worn ? DUNGEON_TILES.floorWorn : DUNGEON_TILES.floor;
        kinds[slot] = CELL.floor;
        tiles[slot] = pool[Math.floor(random() * pool.length)]!;
        filled++;
        continue;
      }
      let touchesFloor = false;
      for (let oy = -1; oy <= 1 && !touchesFloor; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (inside(x + ox, y + oy) && floor[at(x + ox, y + oy)] === true) {
            touchesFloor = true;
            break;
          }
        }
      }
      if (touchesFloor) {
        kinds[slot] = CELL.wall;
        filled++;
      }
    }
  }

  // Pass 2 gives each wall cell its tile.
  //
  // A side is exposed if the cell on that side is not a wall. Masonry continues
  // through a neighbour wall, so a shared side gets no border.
  const isWall = (x: number, y: number): boolean =>
    inside(x, y) && kinds[at(x, y)] === CELL.wall;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const slot = at(x, y);
      if (kinds[slot] !== CELL.wall) continue;
      const openLeft = !isWall(x - 1, y);
      const openRight = !isWall(x + 1, y);
      if (openLeft && openRight) {
        tiles[slot] = DUNGEON_TILES.wallBoth;
      } else if (openLeft) {
        tiles[slot] = DUNGEON_TILES.wallLeft;
      } else if (openRight) {
        tiles[slot] = DUNGEON_TILES.wallRight;
      } else {
        // Both sides are shared. Use the vent tile sometimes. It breaks up a long
        // wall without a border.
        tiles[slot] = random() > 0.88 ? DUNGEON_TILES.wallVent : DUNGEON_TILES.wallMid;
      }
    }
  }

  // Props and torches inside rooms, never on a room's own edge ring.
  const props: DungeonProp[] = [];
  const torches: [number, number][] = [];
  const propTiles = [
    DUNGEON_TILES.crate,
    DUNGEON_TILES.table,
    DUNGEON_TILES.stool,
    DUNGEON_TILES.chest,
    DUNGEON_TILES.potion,
  ];
  for (const room of rooms) {
    const count = 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      props.push({
        x: room.x + 1 + Math.floor(random() * Math.max(room.w - 2, 1)),
        y: room.y + 1 + Math.floor(random() * Math.max(room.h - 2, 1)),
        tile: propTiles[Math.floor(random() * propTiles.length)]!,
      });
    }
    // Torch on the room's top wall, which is the ring just outside the floor.
    torches.push([room.x + Math.floor(room.w / 2), room.y + room.h]);
  }

  // Patrols: a loop around the inside of each room after the first.
  const patrols: PatrolRect[] = rooms.slice(1).map((room) => ({
    x0: room.x + 1.5,
    y0: room.y + 1.5,
    x1: room.x + room.w - 1.5,
    y1: room.y + room.h - 1.5,
  }));

  const first = rooms[0] ?? { x: 2, y: 2, w: 4, h: 4 };
  const spawn: [number, number] = [first.x + first.w / 2, first.y + first.h / 2];

  return {
    width: WIDTH,
    height: HEIGHT,
    kinds,
    tiles,
    filled,
    props,
    torches,
    patrols,
    spawn,
    walkable(x: number, y: number): boolean {
      // Half a tile of body radius, so the sprite never straddles a wall.
      const r = 0.34;
      for (const [ox, oy] of [
        [-r, -r],
        [r, -r],
        [-r, r],
        [r, r],
      ] as const) {
        const cx = Math.floor(x + ox);
        const cy = Math.floor(y + oy);
        if (!inside(cx, cy) || floor[at(cx, cy)] !== true) return false;
      }
      return true;
    },
  };
}

function center(room: Room): [number, number] {
  return [Math.floor(room.x + room.w / 2), Math.floor(room.y + room.h / 2)];
}

function carveLine(
  floor: boolean[],
  at: (x: number, y: number) => number,
  from: readonly [number, number],
  to: readonly [number, number],
): void {
  const spanX = Math.abs(to[0] - from[0]);
  const spanY = Math.abs(to[1] - from[1]);
  const steps = Math.max(spanX, spanY);
  // Widen across the segment, not along it. Offsetting Y on a vertical segment
  // only repeats a cell the loop already reaches, which left every vertical
  // corridor one cell wide while the horizontal ones were two.
  const horizontal = spanX >= spanY;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(from[0] + ((to[0] - from[0]) * i) / Math.max(steps, 1));
    const y = Math.round(from[1] + ((to[1] - from[1]) * i) / Math.max(steps, 1));
    // Two cells wide so corridors read as corridors, not scratches.
    floor[at(x, y)] = true;
    if (horizontal) floor[at(x, Math.min(y + 1, HEIGHT - 1))] = true;
    else floor[at(Math.min(x + 1, WIDTH - 1), y)] = true;
  }
}


type DungeonProgram = BroMetalProgram<
  (typeof dungeonShader)['attributes'],
  (typeof dungeonShader)['instanceAttributes'],
  (typeof dungeonShader)['uniforms']
>;

/** World units of map height on screen. */
const VIEW_HEIGHT = 17;
const HERO_SPEED = 4.6;
/** Where a torch's pool of light reaches zero, in world units. */
const LIGHT_RANGE = 4.25;

/**
 * Which arm of the vertex shader's weight vector an instance belongs to. The
 * lane meanings behind each role are documented in topdown-dungeon.shader.ts.
 */
const ROLE = { terrain: 0, prop: 1, flame: 2, monster: 3, hero: 4 } as const;

/**
 * Atlas geometry. The shader derives every UV rect itself now, so this is the
 * only atlas data the CPU still owns — `spriteAtlas()` in sprites.ts holds the
 * canonical version of the same arithmetic, including why the inset is half a
 * texel and not half a tile, and `atlasRect()` in the shader is its GPU twin.
 */
const ATLAS = { cols: 12, rows: 11, tileWidth: 16, tileHeight: 16 } as const;

/**
 * Top-down 2D on an orthographic camera.
 *
 * Everything — floor, walls, props, torch flames, hero, monsters — is one
 * instanced draw call into one atlas. That works because cut-out sprites write
 * depth: layering is a Z value per sprite rather than a submission order, and
 * the actors get classic y-sorting (things lower on screen overlap things above)
 * from `LAYER.actor` plus a tiny depth nudge derived from their Y. No CPU sort.
 * `LAYER` is handed to the shader as `uLayers` so the table has only one home.
 *
 * The instance buffer is built once and never uploaded again. A tilemap is
 * static data, so it belongs in a texture the vertex shader reads, not in
 * attributes the CPU rebuilds sixty times a second: the level is a 46 x 34 byte
 * image, the torchlight over it is a second 46 x 34 byte image baked at load,
 * monster patrols are a closed form of time, and the hero — the one thing the app
 * genuinely has to know, because it drives the camera and collides with walls —
 * is four floats of uniform.
 */
export default function SpriteTopdownDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [scene, setScene] = useState({ cells: 0, sprites: 0, bytes: 0 });
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
    // A key held while the window loses the focus never sends its keyup, so the
    // hero would keep walking. Drop every held key instead.
    const onBlur = (): void => {
      keysRef.current.clear();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

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

      const program: DungeonProgram = createProgram(renderer, dungeonShader, { blend: 'none' });
      program.attributes.aPosition.set(QUAD_POSITIONS);
      program.attributes.aUv.set(QUAD_UVS);
      program.setIndices(QUAD_INDICES);

      const dungeon: Dungeon = buildDungeon();

      // --- the level, as two textures uploaded once ---

      // R = kind (1 floor, 2 wall), G = the atlas tile: two bytes per cell, and
      // the whole tilemap. The vertex shader looks up its own cell, so a terrain
      // instance never has to be told what it is.
      const map = createDataTexture(renderer, dungeon.width, dungeon.height, (x, y) => {
        const slot = y * dungeon.width + x;
        return { r: dungeon.kinds[slot], g: dungeon.tiles[slot], a: 255 };
      });

      // Torchlight, baked. The field is a function of position and nothing else —
      // the flicker is the only part that moves — so summing it per vertex per
      // frame was paying forever for an answer that never changes. Nine torches
      // in nine separate rooms barely overlap (measured: 757 of 767 occupied
      // cells see exactly one pool, and the widest overlap is worth 0.25 of a
      // falloff), so one byte of distance to the NEAREST torch plus one byte
      // naming it is the whole field.
      const light = createDataTexture(renderer, dungeon.width, dungeon.height, (x, y) => {
        let nearest = 0;
        let best = Infinity;
        for (let i = 0; i < dungeon.torches.length; i++) {
          const torch = dungeon.torches[i]!;
          // Cell centres on both sides, so the two halves cancel.
          const distance = Math.hypot(x - torch[0], y - torch[1]);
          if (distance < best) {
            best = distance;
            nearest = i;
          }
        }
        // Normalised to LIGHT_RANGE, so the shader needs neither the torch
        // positions nor the radius — just a 0..1 distance to square.
        return { r: quantizeDistance(best, LIGHT_RANGE), g: nearest, a: 255 };
      });

      // --- the instance buffer, built once ---

      // Only cells that hold something get an instance. Compacting a list that
      // never changes costs one pass over a byte array at load; the alternative
      // — uploading all 1,564 grid slots and letting the 797 empty ones push
      // themselves out of the clip volume — would have run the whole vertex stage
      // for those 797 every frame, because clipping happens *after* the vertex
      // shader. Self-culling is for visibility that changes; this level's never
      // does.
      const sprites =
        dungeon.filled + dungeon.props.length + dungeon.torches.length + dungeon.patrols.length + 1;
      const slotData = new Float32Array(sprites * 4);
      const rectData = new Float32Array(sprites * 4);
      let next = 0;
      /** Writes one instance's iSlot lanes and returns the instance index. */
      const push = (x: number, y: number, role: number, tile: number): number => {
        const i = next++;
        slotData[i * 4] = x;
        slotData[i * 4 + 1] = y;
        slotData[i * 4 + 2] = role;
        slotData[i * 4 + 3] = tile;
        return i;
      };

      for (let y = 0; y < dungeon.height; y++) {
        for (let x = 0; x < dungeon.width; x++) {
          // The tile lane stays zero: terrain reads its tile out of the map
          // texture, so a terrain instance carries only its own grid coordinate.
          if (dungeon.kinds[y * dungeon.width + x] !== CELL.empty) push(x, y, ROLE.terrain, 0);
        }
      }
      for (const prop of dungeon.props) push(prop.x, prop.y, ROLE.prop, prop.tile);
      for (const torch of dungeon.torches) push(torch[0], torch[1], ROLE.flame, DUNGEON_TILES.torch);
      dungeon.patrols.forEach((patrol, i) => {
        // iSlot.x carries the patrol speed for this role, not a grid column.
        const speed = 1.5 + (i % 3) * 0.45;
        const at = push(speed, 0, ROLE.monster, MONSTERS[i % MONSTERS.length]!);
        rectData[at * 4] = patrol.x0;
        rectData[at * 4 + 1] = patrol.y0;
        rectData[at * 4 + 2] = patrol.x1;
        rectData[at * 4 + 3] = patrol.y1;
      });
      push(0, 0, ROLE.hero, DUNGEON_TILES.hero);

      program.instanceAttributes.iSlot.set(slotData);
      program.instanceAttributes.iRect.set(rectData);

      // Samplers and constants are set once, outside the loop. Re-setting a
      // sampler every frame invalidates the cached WebGPU bind group and forces
      // a fresh allocation for no reason.
      program.uniforms.uAtlas.set(atlasTexture);
      program.uniforms.uMap.set(map.texture);
      program.uniforms.uMapSize.set(map.size);
      program.uniforms.uLight.set(light.texture);
      program.uniforms.uAtlasGrid.set([ATLAS.cols, ATLAS.rows]);
      program.uniforms.uAtlasInset.set([
        0.5 / (ATLAS.cols * ATLAS.tileWidth),
        0.5 / (ATLAS.rows * ATLAS.tileHeight),
      ]);
      program.uniforms.uLayers.set([LAYER.floor, LAYER.decor, LAYER.item, LAYER.actor]);
      program.uniforms.uCutoff.set(0.5);

      setScene({
        cells: dungeon.width * dungeon.height,
        sprites,
        // Everything the GPU is ever told about this level, in bytes.
        bytes: slotData.byteLength + rectData.byteLength + map.width * map.height * 8,
      });

      const hero = { x: dungeon.spawn[0], y: dungeon.spawn[1] };
      // (x, y, facing, walking) — reused so the loop allocates nothing.
      const heroUniform = new Float32Array([hero.x, hero.y, 1, 0]);
      const viewProj = mat4.scratch();
      let last = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const dt = Math.min(Math.max(t - last, 0), 0.05);
        last = t;

        // --- hero movement, blocked by walls ---
        //
        // This is the one piece that cannot leave the CPU. There is no readback,
        // and the camera, the wall test and any future interaction all need the
        // answer here — so the hero is integrated in JS and shipped as a uniform.
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
        heroUniform[0] = hero.x;
        heroUniform[1] = hero.y;
        heroUniform[2] = dx < 0 ? -1 : 1;
        heroUniform[3] = dx !== 0 || dy !== 0 ? 1 : 0;

        // --- camera follows the hero, clamped to the map ---
        const halfHeight = VIEW_HEIGHT / 2;
        const halfWidth = halfHeight * renderer.aspect;
        const camX = clamp(hero.x, halfWidth, dungeon.width - halfWidth);
        const camY = clamp(hero.y, halfHeight, dungeon.height - halfHeight);
        ortho2d(camX, camY, VIEW_HEIGHT, renderer.aspect, viewProj);

        // 84 bytes of payload: a camera, a clock and a hero. Torch flicker,
        // monster patrols, atlas rects, tile choice and lighting are all derived
        // in the vertex shader from data that never moves again.
        program.uniforms.uViewProj.set(viewProj);
        program.uniforms.uTime.set(t);
        program.uniforms.uHero.set(heroUniform);
        program.draw({ instanceCount: sprites });
      });

      cleanup = () => {
        stop();
        program.dispose();
        light.texture.dispose();
        map.texture.dispose();
        atlasTexture.dispose();
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [tick]);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>2D Top-down</h1>
          <p className="panel-note">
            A dungeon crawl in which the level is a <em>texture</em>, not a list of sprites. Walk
            with <strong>WASD</strong>. The whole scene draws in one call, and the CPU sends 84 bytes
            per frame. Each sprite reads its own tile, and its own torchlight, out of two small
            images in the vertex shader.
          </p>
          <p className="panel-note">
            {scene.sprites.toLocaleString()} sprites upload once, then never again. A version that
            rebuilt this batch every frame moved about 41 KiB per frame, for a level that never
            changes.
          </p>
        </div>
      </div>
      <DemoStats stats={stats}>
        {scene.sprites.toLocaleString()} sprites · 1 draw call · 84 B of uniform payload per frame
        (128 B of block on WebGPU), 0 B of geometry
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
