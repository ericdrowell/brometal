'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createCube,
  createPlane,
  createProgram,
  createRenderTarget,
  createRenderer,
  createSphere,
  createTorusKnot,
  type Geometry,
  type RenderTarget,
} from 'brometal';
import DemoStats, { useFrameStats } from './_site/DemoStats';
import depthShader from '../shaders/shadow-depth.shader.gen';
import sceneShader from '../shaders/shadow-scene.shader.gen';
import previewShader from '../shaders/shadow-preview.shader.gen';

/**
 * How far the light can see. Both passes divide world distance by this, so it
 * is the one number that has to agree between them.
 */
const LIGHT_RANGE = 44;
const MAP_SIZES = [256, 512, 1024, 2048];

/** [x, y, z, scaleX, scaleY, scaleZ, spin, r, g, b] */
type Instance = readonly number[];

const GROUND: Instance = [0, -0.2, 0, 40, 0.4, 40, 0, 0.52, 0.54, 0.6];

/** Six props in a ring, alternating box and sphere, at staggered heights. */
function ring(kind: 'box' | 'ball'): Instance[] {
  const out: Instance[] = [];
  for (let i = 0; i < 6; i++) {
    if ((i % 2 === 0) !== (kind === 'box')) continue;
    const angle = (i / 6) * Math.PI * 2;
    const radius = 5.4;
    const hue = i / 6;
    const [r, g, b] = hsl(hue, 0.62, 0.56);
    const lift = 0.9 + (i % 3) * 0.75;
    out.push(
      kind === 'box'
        ? [Math.cos(angle) * radius, lift, Math.sin(angle) * radius, 1.5, 1.5, 1.5, 0.35 + i * 0.1, r, g, b]
        : [Math.cos(angle) * radius, lift + 0.3, Math.sin(angle) * radius, 1, 1, 1, 0, r, g, b],
    );
  }
  return out;
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** Splits the flat instance list into the per-attribute buffers the shaders want. */
function instanceBuffers(instances: Instance[]): {
  offset: Float32Array;
  scale: Float32Array;
  spin: Float32Array;
  color: Float32Array;
  ground: Float32Array;
  count: number;
} {
  const n = instances.length;
  const offset = new Float32Array(n * 3);
  const scale = new Float32Array(n * 3);
  const spin = new Float32Array(n);
  const color = new Float32Array(n * 3);
  const ground = new Float32Array(n);
  instances.forEach((it, i) => {
    offset.set([it[0]!, it[1]!, it[2]!], i * 3);
    scale.set([it[3]!, it[4]!, it[5]!], i * 3);
    spin[i] = it[6]!;
    color.set([it[7]!, it[8]!, it[9]!], i * 3);
    ground[i] = it === GROUND ? 1 : 0;
  });
  return { offset, scale, spin, color, ground, count: n };
}

export default function ShadowDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats, tick } = useFrameStats();
  const [height, setHeight] = useState(11);
  const [softness, setSoftness] = useState(1.6);
  const [mapSize, setMapSize] = useState(1024);
  const [showMap, setShowMap] = useState(true);
  const heightRef = useRef(height);
  const softnessRef = useRef(softness);
  const mapSizeRef = useRef(mapSize);
  const showMapRef = useRef(showMap);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, {
        clearColor: [0.043, 0.047, 0.063, 1],
        // Every mesh here is closed, and culling back faces halves what the
        // shadow pass has to rasterize.
        cull: 'back',
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }

      const cube = createCube({ width: 1, height: 1, depth: 1 });
      const sphere = createSphere({ radius: 0.85, widthSegments: 40, heightSegments: 28 });
      const knot = createTorusKnot({ radius: 1.5, tube: 0.45, tubularSegments: 220, radialSegments: 26 });
      const quad = createPlane({ width: 2, height: 2 });

      const boxes = ring('box');
      const balls = ring('ball');
      const knotInstance: Instance[] = [[0, 2.5, 0, 1, 1, 1, 0.5, 0.86, 0.72, 0.36]];

      /** Wires a geometry plus an instance set into the lit pass. */
      const buildScene = (geometry: Geometry, instances: Instance[]) => {
        const program = createProgram(renderer, sceneShader);
        const data = instanceBuffers(instances);
        program.attributes.aPosition.set(geometry.positions);
        program.attributes.aNormal.set(geometry.normals);
        program.setIndices(geometry.indices);
        program.instanceAttributes.iOffset.set(data.offset);
        program.instanceAttributes.iScale.set(data.scale);
        program.instanceAttributes.iSpin.set(data.spin);
        program.instanceAttributes.iColor.set(data.color);
        program.instanceAttributes.iGround.set(data.ground);
        program.uniforms.uRange.set(LIGHT_RANGE);
        return program;
      };

      /** The same geometry and instances again, for the light's point of view. */
      const buildDepth = (geometry: Geometry, instances: Instance[]) => {
        const program = createProgram(renderer, depthShader);
        const data = instanceBuffers(instances);
        program.attributes.aPosition.set(geometry.positions);
        program.setIndices(geometry.indices);
        program.instanceAttributes.iOffset.set(data.offset);
        program.instanceAttributes.iScale.set(data.scale);
        program.instanceAttributes.iSpin.set(data.spin);
        program.uniforms.uRange.set(LIGHT_RANGE);
        return program;
      };

      // The ground receives shadows but never casts one worth having, so it is
      // absent from the depth pass — which keeps the light's frustum tight
      // around the props instead of stretched over a 40-unit slab.
      const sceneCubes = buildScene(cube, [GROUND, ...boxes]);
      const sceneBalls = buildScene(sphere, balls);
      const sceneKnot = buildScene(knot, knotInstance);
      const depthCubes = buildDepth(cube, boxes);
      const depthBalls = buildDepth(sphere, balls);
      const depthKnot = buildDepth(knot, knotInstance);
      const scenePrograms = [sceneCubes, sceneBalls, sceneKnot];
      const depthPrograms = [depthCubes, depthBalls, depthKnot];

      const preview = createProgram(renderer, previewShader);
      preview.attributes.aPosition.set(quad.positions);
      preview.setIndices(quad.indices);

      let shadowMap: RenderTarget = createRenderTarget(renderer, {
        width: mapSizeRef.current,
        height: mapSizeRef.current,
        // The whole point: the map must keep the *nearest* surface to the
        // light, which needs a depth test in the off-screen pass.
        depth: true,
      });
      let builtSize = mapSizeRef.current;

      const camera = createCamera({ position: [0, 6, 16], fovY: 0.72, near: 0.5, far: 90 });
      // Wide enough that a low light's long shadows stay inside the map. Anything
      // that falls outside reads as lit, so a too-narrow cone truncates shadows
      // mid-stretch rather than degrading gracefully.
      const lightCamera = createCamera({ fovY: 1.32, near: 1.5, far: LIGHT_RANGE });

      const stop = renderer.loop((t) => {
        tick(t);
        if (builtSize !== mapSizeRef.current) {
          builtSize = mapSizeRef.current;
          shadowMap.dispose();
          shadowMap = createRenderTarget(renderer, { width: builtSize, height: builtSize, depth: true });
        }

        const lightAngle = t * 0.28;
        const lightPos: [number, number, number] = [
          Math.cos(lightAngle) * 12,
          heightRef.current,
          Math.sin(lightAngle) * 12,
        ];
        lightCamera.setPosition(lightPos[0], lightPos[1], lightPos[2]);
        lightCamera.lookAt(0, 1.2, 0);
        // Square map, so the light's aspect is 1 — using the canvas aspect here
        // stretches the map's footprint and the shadows slide as you resize.
        const lightViewProj = lightCamera.viewProjection(1);

        // ── Pass 1: the scene as the light sees it ──────────────────────────
        renderer.drawTo(
          shadowMap,
          () => {
            for (const program of depthPrograms) {
              program.uniforms.uLightViewProj.set(lightViewProj);
              program.uniforms.uLightPos.set(lightPos);
              program.uniforms.uTime.set(t);
              program.draw();
            }
          },
          // Cleared to "as far as the light can see", so texels no geometry
          // covered report nothing in the way and stay lit.
          { clear: [1, 1, 1, 1] },
        );

        // ── Pass 2: the scene as the camera sees it ─────────────────────────
        const orbit = t * 0.12;
        const eye: [number, number, number] = [
          Math.sin(orbit) * 19,
          8.2 + Math.sin(t * 0.09) * 1.6,
          Math.cos(orbit) * 19,
        ];
        camera.setPosition(eye[0], eye[1], eye[2]);
        camera.lookAt(0, 1.6, 0);
        const viewProj = camera.viewProjection(renderer.aspect);

        for (const program of scenePrograms) {
          program.uniforms.uViewProj.set(viewProj);
          program.uniforms.uLightViewProj.set(lightViewProj);
          program.uniforms.uShadowMap.set(shadowMap.texture);
          program.uniforms.uLightPos.set(lightPos);
          program.uniforms.uViewPos.set(eye);
          program.uniforms.uTime.set(t);
          program.uniforms.uLightColor.set([1, 0.94, 0.82]);
          program.uniforms.uSkyColor.set([0.15, 0.18, 0.26]);
          program.uniforms.uGroundColor.set([0.03, 0.03, 0.045]);
          program.uniforms.uFogColor.set([0.043, 0.047, 0.063]);
          program.uniforms.uTexel.set(1 / builtSize);
          program.uniforms.uSoftness.set(softnessRef.current);
          // World units, and small: distance is linear, so one constant holds
          // everywhere in the scene rather than scaling with depth.
          program.uniforms.uBias.set(0.05);
          program.uniforms.uShadowStrength.set(0.88);
          program.draw();
        }

        if (showMapRef.current) {
          const side = 0.26;
          preview.uniforms.uMap.set(shadowMap.texture);
          // Held square against the canvas aspect, so the inset does not
          // stretch into a letterbox on a wide window.
          preview.uniforms.uRect.set([
            0.99 - side / renderer.aspect,
            -0.99 + side,
            side / renderer.aspect,
            side,
          ]);
          preview.draw();
        }
      });

      cleanup = () => {
        stop();
        shadowMap.dispose();
        for (const program of [...scenePrograms, ...depthPrograms, preview]) {
          program.dispose();
        }
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Shadow</h1>
          <p className="panel-note">
            Shadow mapping in two passes. The scene is drawn from the light into a depth-tested
            render target, each fragment recording its distance to the light; the lit pass projects
            every point back into that map and asks whether anything closer was already there. Nine
            taps per fragment soften the edge. The inset is the map itself.
          </p>
          <div className="row">
            <label htmlFor="height">Light Height</label>
            <input
              id="height"
              type="range"
              min={5}
              max={20}
              step={0.1}
              value={height}
              onChange={(event) => {
                const value = Number(event.target.value);
                setHeight(value);
                heightRef.current = value;
              }}
            />
            <output htmlFor="height">{height.toFixed(1)}</output>
          </div>
          <div className="row">
            <label htmlFor="softness">Softness</label>
            <input
              id="softness"
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={softness}
              onChange={(event) => {
                const value = Number(event.target.value);
                setSoftness(value);
                softnessRef.current = value;
              }}
            />
            <output htmlFor="softness">{softness.toFixed(1)}</output>
          </div>
          <div className="row">
            <label htmlFor="mapsize">Map Size</label>
            <input
              id="mapsize"
              type="range"
              min={0}
              max={MAP_SIZES.length - 1}
              step={1}
              value={MAP_SIZES.indexOf(mapSize)}
              onChange={(event) => {
                const value = MAP_SIZES[Number(event.target.value)]!;
                setMapSize(value);
                mapSizeRef.current = value;
              }}
            />
            <output htmlFor="mapsize">{mapSize}</output>
          </div>
          <button
            type="button"
            className="reset"
            onClick={() => {
              setShowMap((value) => {
                showMapRef.current = !value;
                return !value;
              });
            }}
          >
            {showMap ? 'Hide Map' : 'Show Map'}
          </button>
        </div>
      </div>
      <DemoStats stats={stats}>2 passes · depth-tested shadow map · 9-tap PCF</DemoStats>
    </>
  );
}
