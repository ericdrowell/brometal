'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createProgram,
  createRenderer,
  loadTexture,
  mat4,
  type BroMetalProgram,
  type BroMetalTexture,
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
  type SpriteAtlas,
} from '@/lib/sprite-lib/sprites';
import {
  BACKGROUND_TILES,
  buildLevel,
  CHAR_TILES,
  PLATFORMER_TILES,
  type Level,
} from '@/lib/sprite-lib/platformer';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import DemoCredit from '@/lib/sprite-lib/DemoCredit';

type CutoutProgram = BroMetalProgram<
  (typeof cutoutShader)['attributes'],
  (typeof cutoutShader)['instanceAttributes'],
  (typeof cutoutShader)['uniforms']
>;

const VIEW_HEIGHT = 15;
const RUN_SPEED = 7.5;
const GRAVITY = -34;
const JUMP_SPEED = 12.4;
const COYOTE_SECONDS = 0.09;

/**
 * A playable pixel-art platformer.
 *
 * Three atlases means exactly three draw calls: the parallax background, the
 * world (tiles, coins, flag, foliage), and the characters. Within each,
 * layering is a Z per sprite — background behind the tiles, the player in front
 * of both — resolved by the depth buffer because cut-out sprites write depth.
 */
export default function SpriteSidescrollDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [hud, setHud] = useState({ coins: 0, total: 0, sprites: 0 });
  const keysRef = useRef(new Set<string>());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const onKeyDown = (event: KeyboardEvent): void => {
      keysRef.current.add(event.key.toLowerCase());
      if (CONTROL_KEYS.has(event.key.toLowerCase())) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      keysRef.current.delete(event.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    void (async () => {
      // The clear colour is tile 0 of the background atlas, so the sky and the
      // drawn strips meet with no seam.
      const [skyR, skyG, skyB] = BACKGROUND_TILES.skyColor;
      const renderer = await createRenderer(canvas, { clearColor: [skyR, skyG, skyB, 1] });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const loaded: BroMetalTexture[] = [];
      const load = async (url: string): Promise<BroMetalTexture> => {
        const texture = await loadTexture(renderer, url, { filter: 'nearest', wrap: 'clamp' });
        loaded.push(texture);
        return texture;
      };
      const worldTexture = await load('/sprites/platformer.png');
      const charTexture = await load('/sprites/platformer-characters.png');
      const bgTexture = await load('/sprites/platformer-backgrounds.png');
      if (cancelled) {
        for (const texture of loaded) texture.dispose();
        renderer.destroy();
        return;
      }

      const worldAtlas: SpriteAtlas = spriteAtlas(worldTexture, {
        cols: 20,
        rows: 9,
        tileWidth: 18,
        tileHeight: 18,
      });
      const charAtlas: SpriteAtlas = spriteAtlas(charTexture, {
        cols: 9,
        rows: 3,
        tileWidth: 24,
        tileHeight: 24,
      });
      const bgAtlas: SpriteAtlas = spriteAtlas(bgTexture, {
        cols: 8,
        rows: 3,
        tileWidth: 24,
        tileHeight: 24,
      });

      const program: CutoutProgram = createProgram(renderer, cutoutShader, {
        blend: 'alpha',
        depthWrite: true,
      });
      program.attributes.aPosition.set(QUAD_POSITIONS);
      program.attributes.aUv.set(QUAD_UVS);
      program.setIndices(QUAD_INDICES);
      program.uniforms.uCutoff.set(0.5);

      const level: Level = buildLevel();
      const worldBatch = new SpriteBatch(worldAtlas, 4096);
      const charBatch = new SpriteBatch(charAtlas, 64);
      const bgBatch = new SpriteBatch(bgAtlas, 128);

      const player = {
        x: 3,
        y: 6,
        vx: 0,
        vy: 0,
        grounded: false,
        sinceGrounded: 99,
        facing: 1,
      };
      const coins = level.coins.map((coin) => ({ ...coin, taken: false }));
      let collected = 0;
      let jumpHeld = false;

      const viewProj = mat4.scratch();
      let last = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const dt = Math.min(Math.max(t - last, 0), 1 / 30);
        last = t;

        // --- input ---
        const keys = keysRef.current;
        const left = keys.has('a') || keys.has('arrowleft');
        const right = keys.has('d') || keys.has('arrowright');
        const wantJump = keys.has(' ') || keys.has('w') || keys.has('arrowup');

        player.vx = (right ? RUN_SPEED : 0) - (left ? RUN_SPEED : 0);
        if (player.vx !== 0) player.facing = player.vx > 0 ? 1 : -1;

        // Coyote time: a jump pressed a few frames after walking off a ledge
        // still counts. Without it the controls feel broken rather than strict.
        player.sinceGrounded = player.grounded ? 0 : player.sinceGrounded + dt;
        if (wantJump && !jumpHeld && player.sinceGrounded < COYOTE_SECONDS) {
          player.vy = JUMP_SPEED;
          player.grounded = false;
          player.sinceGrounded = 99;
        }
        jumpHeld = wantJump;

        player.vy = Math.max(player.vy + GRAVITY * dt, -28);

        // --- horizontal then vertical, so a corner never wedges the player ---
        const halfW = 0.34;
        const halfH = 0.48;
        const stepX = player.vx * dt;
        if (!level.solidAt(player.x + stepX + Math.sign(stepX) * halfW, player.y, halfW, halfH)) {
          player.x += stepX;
        }
        const stepY = player.vy * dt;
        if (level.solidAt(player.x, player.y + stepY, halfW, halfH)) {
          if (player.vy < 0) player.grounded = true;
          player.vy = 0;
        } else {
          player.y += stepY;
          if (player.vy !== 0) player.grounded = false;
        }
        player.x = Math.min(Math.max(player.x, 1), level.width - 1);
        if (player.y < -6) {
          player.x = 3;
          player.y = 6;
          player.vy = 0;
        }

        // --- coins ---
        for (const coin of coins) {
          if (coin.taken) continue;
          if (Math.abs(coin.x - player.x) < 0.7 && Math.abs(coin.y - player.y) < 0.8) {
            coin.taken = true;
            collected++;
          }
        }

        // --- camera: follow x, clamp to level, keep y mostly steady ---
        const halfHeight = VIEW_HEIGHT / 2;
        const halfWidth = halfHeight * renderer.aspect;
        const camX = Math.min(Math.max(player.x, halfWidth), level.width - halfWidth);
        const camY = Math.max(player.y * 0.35 + 4.2, halfHeight - 2);
        ortho2d(camX, camY, VIEW_HEIGHT, renderer.aspect, viewProj);

        // --- parallax background ---
        // The horizon band scrolls at a fraction of the camera, and the solid
        // haze strip below it butts against the band's lower edge so the two
        // read as one backdrop.
        bgBatch.clear();
        const bandSize = 9;
        const bandY = 7.6;
        const drift = camX * PARALLAX_FACTOR;
        const firstBand = Math.floor((camX - drift - halfWidth) / bandSize) - 1;
        const lastBand = Math.ceil((camX - drift + halfWidth) / bandSize) + 1;
        for (let i = firstBand; i <= lastBand; i++) {
          const x = i * bandSize + drift;
          bgBatch.push({
            x,
            y: bandY,
            z: -0.45,
            width: bandSize,
            height: bandSize,
            tile: BACKGROUND_TILES.band[Math.abs(i) % BACKGROUND_TILES.band.length]!,
          });
          bgBatch.push({
            x,
            y: bandY - bandSize,
            z: -0.45,
            width: bandSize,
            height: bandSize,
            tile: BACKGROUND_TILES.fill,
          });
        }

        // --- world sprites ---
        worldBatch.clear();

        for (const tile of level.tiles) {
          worldBatch.push({
            x: tile.x,
            y: tile.y,
            z: LAYER.floor,
            width: 1,
            height: 1,
            tile: tile.tile,
          });
        }
        for (const decor of level.decor) {
          worldBatch.push({
            x: decor.x,
            y: decor.y,
            z: LAYER.decor,
            width: 1,
            height: 1,
            tile: decor.tile,
          });
        }
        for (const coin of coins) {
          if (coin.taken) continue;
          worldBatch.push({
            x: coin.x,
            // Coins bob and are lit a touch brighter than the world.
            y: coin.y + Math.sin(t * 3.4 + coin.x) * 0.12,
            z: LAYER.item,
            width: 0.8,
            height: 0.8,
            tile: PLATFORMER_TILES.coin,
            tint: [1.15, 1.1, 0.7],
          });
        }
        worldBatch.push({
          x: level.flag[0],
          y: level.flag[1],
          z: LAYER.decor,
          width: 1,
          height: 1,
          tile: Math.floor(t * 6) % 2 === 0 ? PLATFORMER_TILES.flagA : PLATFORMER_TILES.flagB,
        });

        // --- characters ---
        charBatch.clear();
        for (const walker of level.walkers) {
          // Ping-pong along a segment; the sprite flips with the direction.
          const span = walker.to - walker.from;
          const phase = (Math.sin(t * walker.speed + walker.phase) + 1) / 2;
          const x = walker.from + span * phase;
          const heading = Math.cos(t * walker.speed + walker.phase) > 0 ? 1 : -1;
          charBatch.push({
            x,
            y: walker.y,
            z: LAYER.actor - 0.02,
            width: 1.3,
            height: 1.3,
            tile: walker.tile,
            flipX: heading < 0,
          });
        }
        charBatch.push({
          x: player.x,
          y: player.y,
          z: LAYER.actor,
          width: 1.35,
          height: 1.35,
          // Two-frame walk cycle while running on the ground; the airborne
          // frame is held for the whole jump.
          tile: player.grounded
            ? player.vx === 0
              ? CHAR_TILES.playerIdle
              : Math.floor(t * 11) % 2 === 0
                ? CHAR_TILES.playerIdle
                : CHAR_TILES.playerWalk
            : CHAR_TILES.playerWalk,
          flipX: player.facing < 0,
        });

        // --- draw: one call per atlas ---
        program.uniforms.uViewProj.set(viewProj);
        program.uniforms.uRight.set(AXIS_RIGHT);
        program.uniforms.uUp.set(AXIS_UP);

        program.uniforms.uAtlas.set(bgTexture);
        program.instanceAttributes.iCenter.set(bgBatch.centers);
        program.instanceAttributes.iSize.set(bgBatch.sizes);
        program.instanceAttributes.iUvRect.set(bgBatch.uvRects);
        program.instanceAttributes.iTint.set(bgBatch.tints);
        program.draw({ instanceCount: bgBatch.count });

        program.uniforms.uAtlas.set(worldTexture);
        program.instanceAttributes.iCenter.set(worldBatch.centers);
        program.instanceAttributes.iSize.set(worldBatch.sizes);
        program.instanceAttributes.iUvRect.set(worldBatch.uvRects);
        program.instanceAttributes.iTint.set(worldBatch.tints);
        program.draw({ instanceCount: worldBatch.count });

        program.uniforms.uAtlas.set(charTexture);
        program.instanceAttributes.iCenter.set(charBatch.centers);
        program.instanceAttributes.iSize.set(charBatch.sizes);
        program.instanceAttributes.iUvRect.set(charBatch.uvRects);
        program.instanceAttributes.iTint.set(charBatch.tints);
        program.draw({ instanceCount: charBatch.count });

        if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) {
          setHud({
            coins: collected,
            total: coins.length,
            sprites: bgBatch.count + worldBatch.count + charBatch.count,
          });
        }
      });

      cleanup = () => {
        stop();
        program.dispose();
        for (const texture of loaded) texture.dispose();
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
          <h1>2D Side-scroller</h1>
          <p>
            <strong>A / D</strong> or <strong>← →</strong> to run, <strong>Space</strong> or{' '}
            <strong>W</strong> to jump. Collect the coins; fall off and you respawn at the start.
          </p>
          <p>
            Three atlases, three draw calls — background, world, characters. The parallax
            horizon, tiles, coins, the flag, the walkers and the player are all instanced batches
            layered by a Z per sprite. The depth buffer resolves it, so nothing here maintains a
            back-to-front submission order.
          </p>
          <p>
            The player is an over-allocated batch drawn with{' '}
            <code>draw(&#123; instanceCount &#125;)</code>, so a coin disappearing costs one fewer
            instance rather than a buffer reallocation.
          </p>
        </div>
      </div>
      <DemoStats stats={stats}>
        {hud.coins}/{hud.total} coins · {hud.sprites} sprites · 3 draw calls
        <br />
        <DemoCredit />
        <br />
        Sprites: Pixel Platformer by{' '}
        <a href="https://kenney.nl/assets/pixel-platformer">Kenney</a> (CC0)
      </DemoStats>
      <BackendBadge backend={backend} />
    </>
  );
}

const CONTROL_KEYS = new Set([
  'w',
  'a',
  'd',
  ' ',
  'arrowup',
  'arrowleft',
  'arrowright',
  'arrowdown',
]);

/**
 * How much of the camera's motion the background keeps. 0 would pin it to the
 * world, 1 would pin it to the screen; 0.72 reads as distant hills.
 */
const PARALLAX_FACTOR = 0.72;
