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
import dungeonShader from '@/lib/sprite-lib/shaders/topdown-dungeon.shader.gen';
import { LAYER, QUAD_INDICES, QUAD_POSITIONS, QUAD_UVS, ortho2d } from '@/lib/sprite-lib/sprites';
import { createDataTexture, quantizeDistance } from '@/lib/sprite-lib/data-texture';
import { buildDungeon, CELL, DUNGEON_TILES, type Dungeon } from '@/lib/sprite-lib/dungeon';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import DemoCredit from '@/lib/sprite-lib/DemoCredit';

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

      const program: DungeonProgram = createProgram(renderer, dungeonShader, {
        blend: 'alpha',
        depthWrite: true,
      });
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
            The map <em>is</em> a texture: {scene.cells.toLocaleString()} cells of &ldquo;what stands
            here, which tile&rdquo;, two bytes each, read per instance in the vertex shader — so a
            floor tile&rsquo;s instance carries nothing but its own grid coordinate. Torchlight is a
            second byte image baked at load —
            distance to the nearest torch, and which torch — so a sprite costs one texture fetch to
            light instead of a loop over every lamp in the level. That is not fewer arithmetic
            operations than the CPU pass it replaced; flicker is still a sine per sprite per frame.
            What it buys is that no lighting result crosses the bus and no JavaScript ever walks the
            level again. Monster patrols are a closed form of the clock, and the atlas rect of a tile
            index is derived in the shader rather than uploaded.
          </p>
          <p>
            The instance buffer is uploaded <strong>once</strong>:{' '}
            {scene.sprites.toLocaleString()} sprites,{' '}
            {Math.round(scene.bytes / 1024).toLocaleString()} KiB of it, and then nothing. Per frame
            the bus carries 84 bytes of payload — a view-projection, a clock, and the hero&rsquo;s
            position, the one thing that has to stay on the CPU because it drives the camera and the
            wall test and nothing can be read back off the GPU. WebGPU rewrites its whole 128-byte
            uniform block to deliver those 84. The same scene rebuilt into a sprite batch every frame
            is {scene.sprites.toLocaleString()} instances × 13 floats, about 41 KiB a frame forever,
            for a level that never changes.
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
