'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createCube,
  createPlane,
  createProgram,
  createRenderer,
  loadTexture,
  type RendererBackend,
} from 'brometal';
import BackendBadge from './_site/BackendBadge';
import DemoStats, { useFrameStats } from './_site/DemoStats';
import blocksShader from '../shaders/brocraft-blocks.shader.gen';
import waterShader from '../shaders/brocraft-water.shader.gen';
import skyShader from '../shaders/brocraft-sky.shader.gen';

const SEA_LEVEL = 0;
const AMPLITUDE = 1;
const FOV = 1.28;
const WALK = 11;
const SPRINT = 34;

const DISTANCES = [
  { label: 'Near', radius: 40 },
  { label: 'Medium', radius: 56 },
  { label: 'Far', radius: 72 },
];

/**
 * The only geometry the CPU ever builds: a ring of integer grid offsets,
 * sorted near-to-far so the GPU can reject hidden fragments early. Each
 * offset is repeated once per layer — one instance per potential block —
 * and the shader turns (offset, layer) into a world position.
 */
function buildCells(radius: number, layers: number): { blocks: Float32Array; water: Float32Array } {
  const cells: { x: number; z: number; d: number }[] = [];
  const r2 = radius * radius;
  for (let x = -radius; x <= radius; x++) {
    for (let z = -radius; z <= radius; z++) {
      const d = x * x + z * z;
      if (d <= r2) cells.push({ x, z, d });
    }
  }
  cells.sort((a, b) => a.d - b.d);

  const blocks = new Float32Array(cells.length * layers * 3);
  const water = new Float32Array(cells.length * 2);
  let b = 0;
  for (const cell of cells) {
    for (let layer = 0; layer < layers; layer++) {
      blocks[b++] = cell.x;
      blocks[b++] = cell.z;
      blocks[b++] = layer;
    }
  }
  cells.forEach((cell, i) => {
    water[i * 2] = cell.x;
    water[i * 2 + 1] = cell.z;
  });
  return { blocks, water };
}

type Vec3 = [number, number, number];

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Sky, sun and ambient colours for a sun elevation — night → sunrise → day. */
function palette(elevation: number) {
  const night = {
    horizon: [0.075, 0.095, 0.17] as Vec3,
    zenith: [0.02, 0.03, 0.075] as Vec3,
    sun: [0.34, 0.4, 0.58] as Vec3,
  };
  const golden = {
    horizon: [0.98, 0.6, 0.34] as Vec3,
    zenith: [0.13, 0.24, 0.5] as Vec3,
    sun: [1, 0.62, 0.34] as Vec3,
  };
  const day = {
    horizon: [0.7, 0.81, 0.94] as Vec3,
    zenith: [0.2, 0.44, 0.82] as Vec3,
    sun: [1, 0.96, 0.88] as Vec3,
  };
  const dawn = smooth(-0.09, 0.05, elevation);
  const noon = smooth(0.05, 0.36, elevation);
  const horizon = lerp3(lerp3(night.horizon, golden.horizon, dawn), day.horizon, noon);
  const zenith = lerp3(lerp3(night.zenith, golden.zenith, dawn), day.zenith, noon);
  const sun = lerp3(lerp3(night.sun, golden.sun, dawn), day.sun, noon);
  // Ambient: the sky bounces onto upward faces, the ground onto downward ones.
  const skyTint = lerp3(zenith, horizon, 0.5).map((c) => c * 0.95) as Vec3;
  const groundTint = [0.22, 0.19, 0.15].map((c) => c * (0.25 + noon * 0.75)) as Vec3;
  return { horizon, zenith, sun, skyTint, groundTint };
}

export default function BrocraftDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [locked, setLocked] = useState(false);
  const [distance, setDistance] = useState(1);
  const [layers, setLayers] = useState(6);
  const [timeOfDay, setTimeOfDay] = useState(0.27);
  const [world, setWorld] = useState({ x: 0, y: 0, z: 0, blocks: 0 });

  const distanceRef = useRef(distance);
  const layersRef = useRef(layers);
  const todRef = useRef(timeOfDay);
  const rebuildRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, {
        clearColor: [0.55, 0.72, 0.92, 1],
        cull: 'back',
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const cube = createCube({ width: 1, height: 1, depth: 1 });
      const quad = createPlane({ width: 2, height: 2 });

      // ── Sky: one full-screen quad, drawn first at the far plane ──────────
      const sky = createProgram(renderer, skyShader);
      sky.attributes.aPosition.set(quad.positions);
      sky.attributes.aUv.set(quad.uvs);
      sky.setIndices(quad.indices);

      // ── Blocks: one instanced unit cube per potential block ──────────────
      const blocks = createProgram(renderer, blocksShader);
      blocks.attributes.aPosition.set(cube.positions);
      blocks.attributes.aNormal.set(cube.normals);
      blocks.setIndices(cube.indices);
      blocks.uniforms.uSea.set(SEA_LEVEL);
      blocks.uniforms.uAmp.set(AMPLITUDE);

      // ── Water: one alpha-blended quad per column, laid at sea level ──────
      const water = createProgram(renderer, waterShader, { blend: 'alpha' });
      const tile = createPlane({ width: 1, height: 1 });
      water.attributes.aPosition.set(tile.positions);
      water.setIndices(tile.indices);
      water.uniforms.uSea.set(SEA_LEVEL);
      water.uniforms.uAmp.set(AMPLITUDE);

      const [grass, dirt, stone, sand] = await Promise.all([
        // Anisotropy is what keeps ground stretching to the horizon from
        // shimmering — trilinear alone has to pick one mip for a footprint
        // that is many texels long and one wide.
        loadTexture(renderer, '/textures/brocraft-grass.jpg', { anisotropy: 16 }),
        loadTexture(renderer, '/textures/brocraft-dirt.jpg', { anisotropy: 16 }),
        loadTexture(renderer, '/textures/brocraft-stone.jpg', { anisotropy: 16 }),
        loadTexture(renderer, '/textures/brocraft-sand.jpg', { anisotropy: 16 }),
      ]);
      if (cancelled) {
        renderer.destroy();
        return;
      }
      blocks.uniforms.uGrass.set(grass);
      blocks.uniforms.uDirt.set(dirt);
      blocks.uniforms.uStone.set(stone);
      blocks.uniforms.uSand.set(sand);

      let radius = DISTANCES[distanceRef.current]!.radius;
      let blockCount = 0;
      const rebuild = (): void => {
        radius = DISTANCES[distanceRef.current]!.radius;
        const cells = buildCells(radius, layersRef.current);
        blocks.instanceAttributes.iCell.set(cells.blocks);
        water.instanceAttributes.iCell.set(cells.water);
        blocks.uniforms.uRadius.set(radius);
        blocks.uniforms.uLayers.set(layersRef.current);
        water.uniforms.uRadius.set(radius);
        blockCount = cells.blocks.length / 3;
      };
      rebuild();
      let rebuiltAt = rebuildRef.current;

      // ── Camera: yaw/pitch from the mouse, WASD in the look direction ─────
      // Depth range is kept tight rather than generous: a block world stacks a lot
      // of nearly-coplanar faces, and 0.08/900 spends most of the depth buffer on
      // the first metre.
      const camera = createCamera({ position: [24, 21, 140], fovY: FOV, near: 0.35, far: 400 });
      let px = 24;
      let py = 21;
      let pz = 140;
      let yaw = 2.9;
      let pitch = -0.2;

      const keys = new Set<string>();
      const onKeyDown = (event: KeyboardEvent): void => {
        keys.add(event.code);
        if (event.code === 'Space') event.preventDefault();
      };
      const onKeyUp = (event: KeyboardEvent): void => {
        keys.delete(event.code);
      };
      const onMouseMove = (event: MouseEvent): void => {
        if (document.pointerLockElement !== canvas) return;
        yaw -= event.movementX * 0.0022;
        pitch -= event.movementY * 0.0022;
        pitch = Math.max(-1.55, Math.min(1.55, pitch));
      };
      const onClick = (): void => void canvas.requestPointerLock();
      const onLockChange = (): void => {
        const isLocked = document.pointerLockElement === canvas;
        setLocked(isLocked);
        if (!isLocked) keys.clear();
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('click', onClick);
      document.addEventListener('pointerlockchange', onLockChange);

      let last = 0;
      // The position readout is React state, so it is throttled rather than set
      // every frame — the numbers are unreadable faster than this anyway.
      let hudClock = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const dt = Math.min(t - last, 0.05);
        last = t;
        if (rebuiltAt !== rebuildRef.current) {
          rebuiltAt = rebuildRef.current;
          rebuild();
        }

        // Look direction, then movement: W/S fly along it, A/D strafe flat.
        const cp = Math.cos(pitch);
        const fx = -Math.sin(yaw) * cp;
        const fy = Math.sin(pitch);
        const fz = -Math.cos(yaw) * cp;
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT : WALK) * dt;
        let mx = 0;
        let my = 0;
        let mz = 0;
        if (keys.has('KeyW')) {
          mx += fx;
          my += fy;
          mz += fz;
        }
        if (keys.has('KeyS')) {
          mx -= fx;
          my -= fy;
          mz -= fz;
        }
        if (keys.has('KeyD')) {
          mx += rx;
          mz += rz;
        }
        if (keys.has('KeyA')) {
          mx -= rx;
          mz -= rz;
        }
        if (keys.has('Space')) my += 1;
        if (keys.has('ControlLeft') || keys.has('KeyC')) my -= 1;
        const len = Math.hypot(mx, my, mz);
        if (len > 0) {
          px += (mx / len) * speed;
          py += (my / len) * speed;
          pz += (mz / len) * speed;
        }

        camera.setPosition(px, py, pz);
        camera.setRotation(pitch, yaw, 0);
        const viewProj = camera.viewProjection(renderer.aspect);
        const viewPos: [number, number, number] = [px, py, pz];

        // Sun: the slider sweeps it from before dawn to after dusk.
        const angle = (-0.15 + 1.3 * todRef.current) * Math.PI;
        const sunDir: [number, number, number] = [Math.cos(angle) * 0.86, Math.sin(angle), 0.42];
        const sky3 = palette(Math.sin(angle));
        const fogStart = radius * 0.58;
        const fogEnd = radius - 0.5;

        // Opaque terrain first (instances are sorted near-to-far, so early-Z
        // throws away most of the hidden fragments), then the sky fills only
        // what the terrain left behind, then blended water on top of both.
        blocks.uniforms.uViewProj.set(viewProj);
        blocks.uniforms.uOrigin.set([Math.floor(px), Math.floor(pz)]);
        blocks.uniforms.uViewPos.set(viewPos);
        blocks.uniforms.uSunDir.set(sunDir);
        blocks.uniforms.uSunColor.set(sky3.sun);
        blocks.uniforms.uSkyTint.set(sky3.skyTint);
        blocks.uniforms.uGroundTint.set(sky3.groundTint);
        blocks.uniforms.uHorizon.set(sky3.horizon);
        blocks.uniforms.uZenith.set(sky3.zenith);
        blocks.uniforms.uFogStart.set(fogStart);
        blocks.uniforms.uFogEnd.set(fogEnd);
        blocks.draw();

        sky.uniforms.uRight.set([rx, 0, rz]);
        sky.uniforms.uUp.set([Math.sin(pitch) * Math.sin(yaw), cp, Math.sin(pitch) * Math.cos(yaw)]);
        sky.uniforms.uForward.set([fx, fy, fz]);
        sky.uniforms.uCamPos.set(viewPos);
        sky.uniforms.uSunDir.set(sunDir);
        sky.uniforms.uHorizon.set(sky3.horizon);
        sky.uniforms.uZenith.set(sky3.zenith);
        sky.uniforms.uSunColor.set(sky3.sun);
        sky.uniforms.uTime.set(t);
        sky.uniforms.uTanFov.set(Math.tan(FOV / 2));
        sky.uniforms.uAspect.set(renderer.aspect);
        sky.draw();

        water.uniforms.uViewProj.set(viewProj);
        water.uniforms.uOrigin.set([Math.floor(px), Math.floor(pz)]);
        water.uniforms.uViewPos.set(viewPos);
        water.uniforms.uSunDir.set(sunDir);
        water.uniforms.uSunColor.set(sky3.sun);
        water.uniforms.uHorizon.set(sky3.horizon);
        water.uniforms.uZenith.set(sky3.zenith);
        water.uniforms.uFogStart.set(fogStart);
        water.uniforms.uFogEnd.set(fogEnd);
        water.uniforms.uTime.set(t);
        water.draw();

        hudClock += dt;
        if (hudClock >= 0.5) {
          hudClock = 0;
          setWorld({ x: Math.round(px), y: Math.round(py), z: Math.round(pz), blocks: blockCount });
        }
      });

      cleanup = () => {
        stop();
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('click', onClick);
        document.removeEventListener('pointerlockchange', onLockChange);
        grass.dispose();
        dirt.dispose();
        stone.dispose();
        sand.dispose();
        sky.dispose();
        blocks.dispose();
        water.dispose();
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const onDistance = (index: number): void => {
    setDistance(index);
    distanceRef.current = index;
    rebuildRef.current++;
  };
  const onLayers = (value: number): void => {
    setLayers(value);
    layersRef.current = value;
    rebuildRef.current++;
  };
  const onTimeOfDay = (value: number): void => {
    setTimeOfDay(value);
    todRef.current = value;
  };

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      {locked ? <div className="crosshair" /> : null}
      {!locked ? (
        <div className="play-prompt">
          <strong>Click to play</strong>
          <span>WASD move · mouse look · Space up · C down · Shift sprint · Esc release</span>
        </div>
      ) : null}
      <div className="panels">
        <div className="panel">
          <h1>Brocraft</h1>
          <p className="panel-note">
            Layered grids of instanced cubes. The CPU uploads integer grid offsets <em>once</em>;
            every height, material, and cull decision is made in the vertex shader.
          </p>
          <h2>View distance</h2>
          <div className="tiles brocraft-tiles">
            {DISTANCES.map((option, index) => (
              <button
                key={option.label}
                type="button"
                className={distance === index ? 'selected' : undefined}
                onClick={() => onDistance(index)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="row">
            <label htmlFor="layers">Layers</label>
            <input
              id="layers"
              type="range"
              min={5}
              max={9}
              step={1}
              value={layers}
              onChange={(event) => onLayers(Number(event.target.value))}
            />
            <output htmlFor="layers">{layers}</output>
          </div>
          <div className="row">
            <label htmlFor="tod">Sun</label>
            <input
              id="tod"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={timeOfDay}
              onChange={(event) => onTimeOfDay(Number(event.target.value))}
            />
            <output htmlFor="tod">{Math.round(timeOfDay * 100)}</output>
          </div>
        </div>
      </div>
      <DemoStats stats={stats}>
        {world.blocks.toLocaleString()} block instances in one draw call · x {world.x} · y{' '}
        {world.y} · z {world.z}
      </DemoStats>
      <BackendBadge backend={backend} />
    </>
  );
}
