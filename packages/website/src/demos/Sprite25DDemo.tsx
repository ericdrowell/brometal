'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createPlane,
  createProgram,
  createRenderer,
  createRenderTarget,
  loadTexture,
  type BroMetalProgram,
  type BroMetalTexture,
  type RenderTarget,
  type Renderer,
  type RendererBackend,
} from 'brometal';
import groundShader from '@/lib/sprite-lib/shaders/world-ground.shader.gen';
import waterShader from '@/lib/sprite-lib/shaders/world-water.shader.gen';
import meshShader from '@/lib/sprite-lib/shaders/world-mesh.shader.gen';
import grassShader from '@/lib/sprite-lib/shaders/world-grass.shader.gen';
import spriteShader from '@/lib/sprite-lib/shaders/world-sprite.shader.gen';
import postShader from '@/lib/sprite-lib/shaders/world-post.shader.gen';
import {
  QUAD_INDICES,
  QUAD_POSITIONS,
  QUAD_UVS,
  SpriteBatch,
  billboardBasis,
  spriteAtlas,
  uploadSpriteBatch,
} from '@/lib/sprite-lib/sprites';
import {
  bushyTreeMesh,
  grassBladeMesh,
  groundGrid,
  rockMesh,
  treeMesh,
  type FlatMesh,
} from '@/lib/sprite-lib/mesh';
import { packInstances, type MeshInstanceArrays } from '@/lib/sprite-lib/mesh-batch';
import { buildWorld, WATER_LEVEL, walkHeight, type World } from '@/lib/sprite-lib/world';
import { DUNGEON_TILES } from '@/lib/sprite-lib/dungeon';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import DemoCredit from '@/lib/sprite-lib/DemoCredit';

type MeshProgram = BroMetalProgram<
  (typeof meshShader)['attributes'],
  (typeof meshShader)['instanceAttributes'],
  (typeof meshShader)['uniforms']
>;

const WALK_SPEED = 7;
const CAMERA_LAG = 4;
const SUN = new Float32Array([0.48, 0.74, 0.42]);
const SKY: readonly [number, number, number] = [0.55, 0.75, 0.88];
/** Alpha the scene target is cleared to — the sky reads as maximally far. */
const FAR_DEPTH = 400;
/**
 * Segments per side of the terrain and water grids.
 *
 * 96 over 92 world units is a 0.96-unit cell. The height field's shortest
 * wavelength is 2π/(0.26·√2) ≈ 17 units, so that is ~18 samples per wavelength —
 * already far past the point where more vertices change the silhouette. The
 * terrain used to be at 150 (0.61-unit cells), which cost 2.4× the vertex
 * invocations and 480 KiB of startup upload to render the same hills.
 */
const GRID_SEGMENTS = 96;

/**
 * 2.5D: sprite characters and props inside a real 3D world.
 *
 * Terrain, water, trees, rocks and grass are actual geometry — a displaced grid,
 * flat-shaded instanced meshes, and instanced blades with wind. Fences, barrels,
 * sacks, mushrooms and the hero stay 2D billboards. Because the cut-out sprites
 * write depth, the two kinds interleave correctly in one depth buffer: the hero
 * walks behind a 3D tree and in front of a sprite fence with nothing sorted.
 *
 * Everything renders into a float target whose **alpha channel carries distance
 * from the camera**, and a fullscreen pass reads that back for depth of field.
 * Note the consequence: every scene program runs with `blend: 'none'`, because
 * alpha is depth here and not coverage — blending against it would dissolve the
 * scene. Transparency comes from `discard()` instead, which is the only reason
 * this arrangement is available at all.
 */
export default function Sprite25DDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [counts, setCounts] = useState({ trees: 0, rocks: 0, grass: 0, sprites: 0 });
  const keysRef = useRef(new Set<string>());

  const [focus, setFocus] = useState(22);
  const [aperture, setAperture] = useState(7);
  const [vignette, setVignette] = useState(0.35);
  // Refs so the render loop reads the live value without re-running the effect.
  const focusRef = useRef(22);
  const apertureRef = useRef(7);
  const vignetteRef = useRef(0.35);

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
      const renderer = await createRenderer(canvas, { clearColor: [...SKY, 1] });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const atlasTexture = await loadTexture(renderer, '/sprites/tiny-town.png', {
        filter: 'nearest',
        wrap: 'clamp',
      });
      const heroTexture = await loadTexture(renderer, '/sprites/tiny-dungeon.png', {
        filter: 'nearest',
        wrap: 'clamp',
      });
      if (cancelled) {
        atlasTexture.dispose();
        heroTexture.dispose();
        renderer.destroy();
        return;
      }
      const townAtlas = spriteAtlas(atlasTexture, {
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

      const world: World = buildWorld();

      // --- terrain and water: the same flat grid, displaced by two shaders ---
      // Both grids want the same tessellation now, and a grid is nothing but
      // `-half + i * step` — so it is built once. The two programs still get
      // their own GPU buffers (buffers belong to a program in this runtime), but
      // the JS arrays and the loop that fills them are shared.
      //
      // Sharing it is load-bearing, not just tidy: because ground and water are
      // linear over the *same* cells, "is the water under the terrain here?" is
      // decidable at the three corners of a triangle, which is what lets the
      // water shader cull four fifths of itself with no risk of a hole.
      const grid = groundGrid(world.extent * 2, GRID_SEGMENTS);
      const gridIndices = narrowGridIndices(grid.indices, GRID_SEGMENTS);

      const groundProgram = createProgram(renderer, groundShader);
      groundProgram.attributes.aPosition.set(grid.positions);
      groundProgram.setIndices(gridIndices);
      groundProgram.uniforms.uWaterLevel.set(WATER_LEVEL);

      const waterProgram = createProgram(renderer, waterShader);
      waterProgram.attributes.aPosition.set(grid.positions);
      waterProgram.setIndices(gridIndices);
      waterProgram.uniforms.uWaterLevel.set(WATER_LEVEL);

      // --- instanced 3D scenery: one program per mesh ---
      const buildMeshProgram = (
        mesh: FlatMesh,
        instances: ReturnType<typeof packInstances>,
      ): MeshProgram => {
        const program = createProgram(renderer, meshShader);
        program.attributes.aPosition.set(mesh.positions);
        program.attributes.aNormal.set(mesh.normals);
        program.attributes.aColor.set(mesh.colors);
        program.instanceAttributes.iPos.set(instances.positions);
        program.instanceAttributes.iScaleRot.set(resolveYaw(instances));
        program.instanceAttributes.iTint.set(instances.tints);
        return program;
      };
      const conifers = packInstances(world.conifers);
      const bushy = packInstances(world.bushyTrees);
      const rocks = packInstances(world.rocks);
      const coniferProgram = buildMeshProgram(treeMesh(), conifers);
      const bushyProgram = buildMeshProgram(bushyTreeMesh(), bushy);
      const rockProgram = buildMeshProgram(rockMesh(), rocks);

      const grassInstances = packInstances(world.grass);
      const grassMesh = grassBladeMesh();
      const grassProgram = createProgram(renderer, grassShader);
      grassProgram.attributes.aPosition.set(grassMesh.positions);
      grassProgram.attributes.aNormal.set(grassMesh.normals);
      grassProgram.attributes.aColor.set(grassMesh.colors);
      grassProgram.instanceAttributes.iPos.set(grassInstances.positions);
      grassProgram.instanceAttributes.iScaleRot.set(resolveYaw(grassInstances));
      grassProgram.instanceAttributes.iTint.set(grassInstances.tints);
      grassProgram.uniforms.uWind.set(0.42);

      // The sun never moves, so it is uploaded once rather than re-sent to six
      // programs every frame. Only uViewProj, uCamPos and uTime actually change.
      for (const program of [
        groundProgram,
        waterProgram,
        coniferProgram,
        bushyProgram,
        rockProgram,
        grassProgram,
      ]) {
        program.uniforms.uLightDir.set(SUN);
      }

      // --- sprites: props and hero, one program each ---
      const buildSpriteProgram = () => {
        const program = createProgram(renderer, spriteShader);
        program.attributes.aPosition.set(QUAD_POSITIONS);
        program.attributes.aUv.set(QUAD_UVS);
        program.setIndices(QUAD_INDICES);
        program.uniforms.uCutoff.set(0.5);
        return program;
      };
      const propProgram = buildSpriteProgram();
      const heroProgram = buildSpriteProgram();

      const propBatch = new SpriteBatch(townAtlas, Math.max(world.props.length, 1));
      for (const prop of world.props) {
        propBatch.push({
          x: prop.x,
          y: prop.y,
          z: prop.z,
          width: prop.size,
          height: prop.size,
          tile: prop.tile,
          tint: prop.tint,
        });
      }
      // Props never move: one upload, here, and `uploadSpriteBatch` marks the
      // batch clean so nothing re-sends it.
      const propCount = uploadSpriteBatch(propProgram, propBatch);

      const heroBatch = new SpriteBatch(heroAtlas, 4);

      // --- post pass: depth of field + vignette, straight to the screen ---
      const fullscreen = createPlane({ width: 2, height: 2 });
      const postProgram = createProgram(renderer, postShader, {
        depthTest: false,
        depthWrite: false,
      });
      postProgram.attributes.aPosition.set(fullscreen.positions);
      postProgram.setIndices(fullscreen.indices);

      // The target has to match the canvas, or the scene would be rendered at
      // one aspect and stretched to another. Recreated whenever the drawing
      // buffer changes size.
      let target: RenderTarget | null = null;
      const ensureTarget = (r: Renderer): RenderTarget => {
        const width = Math.max(1, r.canvas.width);
        const height = Math.max(1, r.canvas.height);
        if (target === null || target.width !== width || target.height !== height) {
          target?.dispose();
          target = createRenderTarget(r, { width, height, depth: true });
        }
        return target;
      };

      const hero = { x: world.spawn[0], z: world.spawn[1], facing: 1, bob: 0 };
      const camera = createCamera({ fovY: Math.PI / 4.4, near: 0.4, far: 260 });
      const camPos = new Float32Array([hero.x, 12, hero.z + 17]);
      const camVec = new Float32Array(3);
      const right = new Float32Array(3);
      const up = new Float32Array(3);
      const texel = new Float32Array(2);

      let last = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const dt = Math.min(Math.max(t - last, 0), 0.05);
        last = t;

        // --- hero walks the terrain; screen-up is -Z ---
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
          hero.bob += dt * 10;
        }
        const limit = world.extent - 2;
        hero.x = Math.min(Math.max(hero.x, -limit), limit);
        hero.z = Math.min(Math.max(hero.z, -limit), limit);
        // walkHeight clamps to the waterline, so crossing a lake wades rather
        // than submerges.
        const groundY = walkHeight(hero.x, hero.z);

        // --- follow camera, smoothed, riding the terrain ---
        const k = 1 - Math.exp(-CAMERA_LAG * dt);
        camPos[0]! += (hero.x - camPos[0]!) * k;
        camPos[1]! += (groundY + 11 - camPos[1]!) * k;
        camPos[2]! += (hero.z + 15 - camPos[2]!) * k;
        camera.setPosition(camPos[0]!, camPos[1]!, camPos[2]!);
        camera.lookAt(hero.x, groundY + 1, hero.z);
        const viewProj = camera.viewProjection(renderer.aspect);
        const view = camera.view();
        camVec[0] = camPos[0]!;
        camVec[1] = camPos[1]!;
        camVec[2] = camPos[2]!;

        // --- hero billboard ---
        const heroSize = 1.2;
        heroBatch.clear();
        heroBatch.push({
          x: hero.x,
          y: groundY + heroSize / 2 + (moving ? Math.abs(Math.sin(hero.bob)) * 0.1 : 0),
          z: hero.z,
          width: heroSize,
          height: heroSize,
          tile: DUNGEON_TILES.hero,
          flipX: hero.facing < 0,
        });
        // The hero is the only thing this demo uploads per frame, and it is one
        // sprite: 13 floats. Passing the batch's backing store instead would
        // upload its whole capacity — four sprites' worth — for the same result.
        const heroCount = uploadSpriteBatch(heroProgram, heroBatch);

        billboardBasis(view, true, right, up);

        const scene = ensureTarget(renderer);

        // Alpha of the clear is the sky's "distance": far enough that the sky
        // defocuses with the rest of the background rather than staying sharp.
        renderer.drawTo(
          scene,
          () => {
            groundProgram.uniforms.uViewProj.set(viewProj);
            groundProgram.uniforms.uCamPos.set(camVec);
            groundProgram.draw();

            waterProgram.uniforms.uViewProj.set(viewProj);
            waterProgram.uniforms.uCamPos.set(camVec);
            waterProgram.uniforms.uTime.set(t);
            waterProgram.draw();

            for (const [program, instances] of [
              [rockProgram, rocks],
              [coniferProgram, conifers],
              [bushyProgram, bushy],
            ] as const) {
              program.uniforms.uViewProj.set(viewProj);
              program.uniforms.uCamPos.set(camVec);
              program.draw({ instanceCount: instances.count });
            }

            grassProgram.uniforms.uViewProj.set(viewProj);
            grassProgram.uniforms.uCamPos.set(camVec);
            grassProgram.uniforms.uTime.set(t);
            grassProgram.draw({ instanceCount: grassInstances.count });

            for (const [program, texture, count] of [
              [propProgram, atlasTexture, propCount],
              [heroProgram, heroTexture, heroCount],
            ] as const) {
              if (count === 0) continue;
              program.uniforms.uViewProj.set(viewProj);
              program.uniforms.uRight.set(right);
              program.uniforms.uUp.set(up);
              program.uniforms.uCamPos.set(camVec);
              program.uniforms.uAtlas.set(texture as BroMetalTexture);
              program.draw({ instanceCount: count });
            }
          },
          { clear: [SKY[0], SKY[1], SKY[2], FAR_DEPTH] },
        );

        texel[0] = 1 / scene.width;
        texel[1] = 1 / scene.height;
        postProgram.uniforms.uScene.set(scene.texture);
        postProgram.uniforms.uTexel.set(texel);
        postProgram.uniforms.uFocus.set(focusRef.current);
        postProgram.uniforms.uAperture.set(apertureRef.current);
        // Wider focus range at long focus distances, so the slider stays usable
        // across the whole depth of the scene instead of snapping at the far end.
        postProgram.uniforms.uFocusRange.set(6 + focusRef.current * 0.5);
        postProgram.uniforms.uVignette.set(vignetteRef.current);
        postProgram.draw();

        if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
          setCounts({
            trees: conifers.count + bushy.count,
            rocks: rocks.count,
            grass: grassInstances.count,
            sprites: propCount + heroCount,
          });
        }
      });

      cleanup = () => {
        stop();
        for (const program of [
          groundProgram,
          waterProgram,
          coniferProgram,
          bushyProgram,
          rockProgram,
          grassProgram,
          propProgram,
          heroProgram,
          postProgram,
        ]) {
          program.dispose();
        }
        target?.dispose();
        atlasTexture.dispose();
        heroTexture.dispose();
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
          <h1>Lens</h1>
          <div className="row">
            <label htmlFor="focus">Focus</label>
            <input
              id="focus"
              type="range"
              min={4}
              max={70}
              step={0.5}
              value={focus}
              onChange={(event) => {
                const value = Number(event.target.value);
                setFocus(value);
                focusRef.current = value;
              }}
            />
            <output htmlFor="focus">{focus.toFixed(0)}m</output>
          </div>
          <div className="row">
            <label htmlFor="aperture">Blur</label>
            <input
              id="aperture"
              type="range"
              min={0}
              max={22}
              step={0.5}
              value={aperture}
              onChange={(event) => {
                const value = Number(event.target.value);
                setAperture(value);
                apertureRef.current = value;
              }}
            />
            <output htmlFor="aperture">{aperture.toFixed(1)}</output>
          </div>
          <div className="row">
            <label htmlFor="vignette">Vignette</label>
            <input
              id="vignette"
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={vignette}
              onChange={(event) => {
                const value = Number(event.target.value);
                setVignette(value);
                vignetteRef.current = value;
              }}
            />
            <output htmlFor="vignette">{vignette.toFixed(2)}</output>
          </div>
          <p>
            Blur at 0 makes the pass a straight copy. Pull Focus in and the far hills go soft; push
            it out and the foreground grass does instead.
          </p>
        </div>
        <div className="panel">
          <h1>2.5D World</h1>
          <p>
            <strong>WASD</strong> or <strong>arrow keys</strong> to walk. Wade into the lakes.
          </p>
          <p>
            Terrain, water, trees, rocks and grass are real 3D geometry; the fences, barrels,
            mushrooms and the hero are still sprites. One depth buffer holds both, so the hero is
            occluded by a 3D tree and a sprite fence alike — per pixel, nothing sorted.
          </p>
          <p>
            The scene renders to a float target whose alpha carries camera distance for the blur —
            a channel that is only free because the sprites <code>discard()</code> instead of
            blending.
          </p>
          <p>
            Nothing here is uploaded per frame except the hero&apos;s single quad. Ground normals
            and water ripples come from the height field&apos;s exact derivative rather than a
            central difference — same picture, a third of the sines — and every tree, rock and
            blade of grass ships its rotation already resolved to a cosine and a sine, because a
            value that is constant across an instance would otherwise be recomputed on every one
            of its vertices, every frame.
          </p>
          <p>
            Only a tenth of this world is under water, but the water is one grid over all of it.
            The vertex shader throws away the four fifths of that grid buried under dry land by
            pushing it outside the clip volume — using the bed depth it already had to compute for
            the shading. Grass got the same treatment and it was reverted; the shader files
            explain when the trick pays and when it only looks like it does.
          </p>
        </div>
      </div>
      <DemoStats stats={stats}>
        {counts.trees} trees · {counts.rocks} rocks · {counts.grass} grass blades ·{' '}
        {counts.sprites} sprites · 9 draw calls
        <br />
        <DemoCredit />
        <br />
        Sprites: Tiny Town + Tiny Dungeon by <a href="https://kenney.nl">Kenney</a> (CC0)
      </DemoStats>
      <BackendBadge backend={backend} />
    </>
  );
}

/**
 * Turns `(scale, yaw)` into `(scale, cos yaw, sin yaw)` for the mesh and grass
 * shaders.
 *
 * A yaw is one float and a resolved rotation is two, so this looks like a step
 * backwards — 9,404 instances, 37 KiB more upload. It is not: a yaw is constant
 * across an instance but the pipeline has no per-instance stage, so the shader
 * would evaluate `cos`/`sin` of it once per *vertex*. That is 159,246 grass
 * vertices plus 139,410 tree and rock vertices every frame paying for two
 * transcendentals each — roughly 600,000 a frame — against 37 KiB uploaded once
 * at startup. Trading a one-time upload for permanent per-vertex trig is the
 * mistake; this is the same trade run the right way round.
 *
 * Done here rather than in `packInstances`, which is shared with the other sprite
 * demos; the proper home for it is `mesh-batch.ts` itself.
 */
function resolveYaw(instances: MeshInstanceArrays): Float32Array {
  const out = new Float32Array(Math.max(instances.count, 1) * 3);
  for (let i = 0; i < instances.count; i++) {
    const yaw = instances.scaleYaw[i * 2 + 1]!;
    out[i * 3] = instances.scaleYaw[i * 2]!;
    out[i * 3 + 1] = Math.cos(yaw);
    out[i * 3 + 2] = Math.sin(yaw);
  }
  return out;
}

/**
 * `groundGrid` hands back a `Uint32Array` whatever the grid size, and
 * `setIndices` picks the GPU element type off the array it is given — so a grid
 * whose highest index is 9,408 ships twice the bytes it needs. 96 segments is
 * 55,296 indices: 216 KiB as u32, 108 KiB as u16, for identical geometry.
 *
 * Narrowed here rather than in `mesh.ts`, which is shared with the other sprite
 * demos; the proper home for this is `groundGrid` itself.
 */
function narrowGridIndices(
  indices: Uint32Array,
  segments: number,
): Uint16Array | Uint32Array {
  const vertexCount = (segments + 1) * (segments + 1);
  return vertexCount <= 65536 ? new Uint16Array(indices) : indices;
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
