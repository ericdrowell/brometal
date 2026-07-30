'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createProgram,
  createRenderer,
  loadTexture,
  type BroMetalProgram,
  type BroMetalTexture,
  type RendererBackend,
} from 'brometal';
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
} from '@/lib/sprites';
import { buildVillage, type Village } from '@/lib/village';
import { DUNGEON_TILES } from '@/lib/dungeon';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';

type CutoutProgram = BroMetalProgram<
  (typeof cutoutShader)['attributes'],
  (typeof cutoutShader)['instanceAttributes'],
  (typeof cutoutShader)['uniforms']
>;

const WALK_SPEED = 5.2;
/** How quickly the camera closes the gap to its target each second. */
const CAMERA_LAG = 4.2;

/**
 * 2.5D: 2D sprites standing up in a 3D world.
 *
 * Three programs, one per atlas — ground and props share the town atlas, the
 * hero comes from the dungeon atlas. Each gets its own instance buffers, which
 * is the pattern to use when several batches are drawn per frame.
 *
 * The ground is the same quad as everything else, just expanded along X/Z
 * instead of X/Y-locked: one shader, two bases. And because the sprites are
 * cut-out and write depth, the hero is occluded by the trees he walks behind
 * and occludes the ones he walks in front of — per pixel, with no sorting.
 */
export default function Sprite25DDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [detail, setDetail] = useState({ props: 0, ground: 0 });
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
      const renderer = await createRenderer(canvas, { clearColor: [0.55, 0.77, 0.86, 1] });
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
      const townTexture = await load('/sprites/tiny-town.png');
      const heroTexture = await load('/sprites/tiny-dungeon.png');
      if (cancelled) {
        for (const texture of loaded) texture.dispose();
        renderer.destroy();
        return;
      }

      const townAtlas = spriteAtlas(townTexture, {
        cols: 12,
        rows: 11,
        tileWidth: 16,
        tileHeight: 16,
      });
      const heroAtlas = spriteAtlas(heroTexture, {
        cols: 12,
        rows: 11,
        tileWidth: 16,
        tileHeight: 16,
      });

      // One program per batch. They could share a shader module, but they must
      // not share instance buffers: several uploads per frame into one program
      // is what the per-draw offset ring in the WebGPU backend exists to
      // support, and separate programs make the intent obvious.
      const makeProgram = (): CutoutProgram => {
        const program = createProgram(renderer, cutoutShader, {
          blend: 'alpha',
          depthWrite: true,
        });
        program.attributes.aPosition.set(QUAD_POSITIONS);
        program.attributes.aUv.set(QUAD_UVS);
        program.setIndices(QUAD_INDICES);
        program.uniforms.uCutoff.set(0.5);
        return program;
      };
      const groundProgram = makeProgram();
      const propProgram = makeProgram();
      const heroProgram = makeProgram();

      const village: Village = buildVillage();

      // Ground: static, uploaded once.
      const groundBatch = new SpriteBatch(townAtlas, village.ground.length);
      for (const cell of village.ground) {
        groundBatch.push({ x: cell.x, y: 0, z: cell.z, width: 1, height: 1, tile: cell.tile });
      }
      const uploadInstances = (program: CutoutProgram, batch: SpriteBatch): void => {
        program.instanceAttributes.iCenter.set(batch.centers);
        program.instanceAttributes.iSize.set(batch.sizes);
        program.instanceAttributes.iUvRect.set(batch.uvRects);
        program.instanceAttributes.iTint.set(batch.tints);
      };
      uploadInstances(groundProgram, groundBatch);

      // Props: also static. Every upright billboard in the world.
      const propBatch = new SpriteBatch(townAtlas, village.props.length);
      for (const prop of village.props) {
        propBatch.push({
          x: prop.x,
          y: prop.size / 2,
          z: prop.z,
          width: prop.size,
          height: prop.size,
          tile: prop.tile,
          tint: prop.tint,
        });
      }
      uploadInstances(propProgram, propBatch);

      const heroBatch = new SpriteBatch(heroAtlas, 4);

      const hero = { x: 0, z: 6, facing: 1, bob: 0 };
      const camera = createCamera({ fovY: Math.PI / 4.2, near: 0.3, far: 200 });
      // Camera follows from behind and above; smoothed so it never snaps.
      const camPos = new Float32Array([0, 13, 18]);
      const right = new Float32Array(3);
      const up = new Float32Array(3);

      let last = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const dt = Math.min(Math.max(t - last, 0), 0.05);
        last = t;

        // --- hero walks on the XZ plane; screen-up is -Z ---
        const keys = keysRef.current;
        let moveX = 0;
        let moveZ = 0;
        if (keys.has('a') || keys.has('arrowleft')) moveX -= 1;
        if (keys.has('d') || keys.has('arrowright')) moveX += 1;
        if (keys.has('w') || keys.has('arrowup')) moveZ -= 1;
        if (keys.has('s') || keys.has('arrowdown')) moveZ += 1;
        const moving = moveX !== 0 || moveZ !== 0;
        if (moving) {
          const inv = 1 / Math.hypot(moveX, moveZ);
          hero.x += moveX * inv * WALK_SPEED * dt;
          hero.z += moveZ * inv * WALK_SPEED * dt;
          if (moveX !== 0) hero.facing = moveX > 0 ? 1 : -1;
          hero.bob += dt * 11;
        }
        const limit = village.extent - 1;
        hero.x = Math.min(Math.max(hero.x, -limit), limit);
        hero.z = Math.min(Math.max(hero.z, -limit), limit);

        // --- follow camera, exponentially smoothed toward the ideal spot ---
        const wantX = hero.x;
        // Steep enough that the trees between the camera and the hero stay out
        // of the way, shallow enough to still read as 2.5D rather than top-down.
        const wantY = 13;
        const wantZ = hero.z + 12;
        const k = 1 - Math.exp(-CAMERA_LAG * dt);
        camPos[0]! += (wantX - camPos[0]!) * k;
        camPos[1]! += (wantY - camPos[1]!) * k;
        camPos[2]! += (wantZ - camPos[2]!) * k;
        camera.setPosition(camPos[0]!, camPos[1]!, camPos[2]!);
        camera.lookAt(hero.x, 1.1, hero.z);
        const viewProj = camera.viewProjection(renderer.aspect);
        const view = camera.view();

        // --- hero billboard ---
        heroBatch.clear();
        const heroSize = 1.15;
        heroBatch.push({
          x: hero.x,
          y: heroSize / 2 + (moving ? Math.abs(Math.sin(hero.bob)) * 0.1 : 0),
          z: hero.z,
          width: heroSize,
          height: heroSize,
          tile: DUNGEON_TILES.hero,
          flipX: hero.facing < 0,
        });
        uploadInstances(heroProgram, heroBatch);

        billboardBasis(view, true, right, up);

        // Ground quads lie flat: the basis is X/Z rather than the Y-locked
        // billboard basis the upright sprites use.
        groundProgram.uniforms.uViewProj.set(viewProj);
        groundProgram.uniforms.uRight.set(AXIS_RIGHT);
        groundProgram.uniforms.uUp.set(AXIS_GROUND_UP);
        groundProgram.uniforms.uAtlas.set(townTexture);
        groundProgram.draw({ instanceCount: groundBatch.count });

        propProgram.uniforms.uViewProj.set(viewProj);
        propProgram.uniforms.uRight.set(right);
        propProgram.uniforms.uUp.set(up);
        propProgram.uniforms.uAtlas.set(townTexture);
        propProgram.draw({ instanceCount: propBatch.count });

        heroProgram.uniforms.uViewProj.set(viewProj);
        heroProgram.uniforms.uRight.set(right);
        heroProgram.uniforms.uUp.set(up);
        heroProgram.uniforms.uAtlas.set(heroTexture);
        heroProgram.draw({ instanceCount: heroBatch.count });

        if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
          setDetail({ props: propBatch.count, ground: groundBatch.count });
        }
      });

      cleanup = () => {
        stop();
        groundProgram.dispose();
        propProgram.dispose();
        heroProgram.dispose();
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
          <h1>2.5D World</h1>
          <p>
            <strong>WASD</strong> or the <strong>arrow keys</strong> to walk. Push into the trees —
            the hero passes behind the ones in front of him and in front of the ones behind, resolved
            per pixel by the depth buffer.
          </p>
          <p>
            Every sprite here is the same unit quad. The ground tiles expand along X/Z; the trees,
            fences and hero expand along the camera&apos;s X and world Y, so they stay upright and
            yaw to face the camera. One shader, two bases.
          </p>
          <p>
            Nothing is sorted. Cut-out sprites <code>discard()</code> their transparent pixels and
            write depth, so the hero can stand between two trees and be occluded by exactly the
            pixels that are actually in front of him — which sorting whole sprites can never get
            right.
          </p>
        </div>
      </div>
      <DemoStats stats={stats}>
        {detail.props} billboards · {detail.ground} ground tiles · 3 draw calls, no sort
        <br />
        Sprites: Tiny Town + Tiny Dungeon by <a href="https://kenney.nl">Kenney</a> (CC0)
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
