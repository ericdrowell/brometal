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
  type RenderTarget,
  type RendererBackend,
} from 'brometal';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import physicsShader from '@/shaders/balls-physics.shader.gen';
import shadowShader from '@/shaders/balls-shadow.shader.gen';
import floorShader from '@/shaders/balls-floor.shader.gen';
import seedShader from '@/shaders/balls-seed.shader.gen';
import ballsShader from '@/shaders/balls-render.shader.gen';
import glassShader from '@/shaders/balls-glass.shader.gen';
import backdropShader from '@/shaders/balls-backdrop.shader.gen';

const MAX_BALLS = 320;
const DEFAULT_BALLS = 160;
const RADIUS = 0.17;
const BOUNDS: [number, number, number] = [1.9, 1.9, 1.9];
/** Fixed step: collision response is only stable at a timestep it can trust. */
// 240 Hz: at terminal speed in this box a ball covers ~0.03 per step, a fifth
// of its radius, so it cannot bury itself in a neighbour between steps. Short
// steps are the honest way to keep contacts shallow — capping velocity is not.
const STEP = 1 / 240;
const MAX_STEPS = 8;

/**
 * The light, as a position rather than a direction — a shadow map needs
 * somewhere to stand. Placed along the direction the demo used before, so the
 * shading is unchanged and only the shadows are new.
 */
const LIGHT_POS: [number, number, number] = [5.49, 10.98, 4.27];
/** Comfortably past the far corner of the tank from the light. */
const LIGHT_RANGE = 20;
const SHADOW_SIZE = 1024;
/**
 * The glass reflects the scene by marching against a copy of it. Half
 * resolution: a reflection in a pane is never examined the way the pane's own
 * contents are, and it quarters the fill cost of the extra pass.
 */
const SCENE_SCALE = 0.5;


export default function BallPhysicsDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [count, setCount] = useState(DEFAULT_BALLS);
  const [bounce, setBounce] = useState(0.62);
  const [gravity, setGravity] = useState(9.8);
  const countRef = useRef(count);
  const rebuildRef = useRef(0);
  const bounceRef = useRef(bounce);
  const gravityRef = useRef(gravity);
  const shakeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, {
        clearColor: [0.02, 0.02, 0.03, 1],
        // Glass needs both faces, so culling stays off for the whole scene.
        cull: 'none',
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const quad = createPlane({ width: 2, height: 2 });
      const ball = createSphere({ radius: 1, widthSegments: 26, heightSegments: 18 });
      const box = createCube({ width: 1, height: 1, depth: 1 });

      // ── State lives in a pair of float targets, N wide and 2 tall ─────────
      // Left half is position, right half velocity — laid out along X because
      // texture V points opposite ways on the two backends. One is read while
      // the other is written, then they swap; the CPU never sees a coordinate.
      let read: RenderTarget = createRenderTarget(renderer, { width: countRef.current * 2, height: 1 });
      let write: RenderTarget = createRenderTarget(renderer, { width: countRef.current * 2, height: 1 });

      // Depth-tested, unlike the state targets: the map has to keep the
      // nearest ball to the light, not the last one drawn.
      const shadowMap = createRenderTarget(renderer, {
        width: SHADOW_SIZE,
        height: SHADOW_SIZE,
        depth: true,
      });

      const seed = createProgram(renderer, seedShader);
      seed.attributes.aPosition.set(quad.positions);
      seed.attributes.aUv.set(quad.uvs);
      seed.setIndices(quad.indices);
      seed.uniforms.uBounds.set(BOUNDS);
      seed.uniforms.uRadius.set(RADIUS);

      const physics = createProgram(renderer, physicsShader);
      physics.attributes.aPosition.set(quad.positions);
      physics.attributes.aUv.set(quad.uvs);
      physics.setIndices(quad.indices);
      physics.uniforms.uBounds.set(BOUNDS);
      physics.uniforms.uRadius.set(RADIUS);
      physics.uniforms.uDt.set(STEP);
      physics.uniforms.uFriction.set(0.14);
      physics.uniforms.uDrag.set(0.12);
      physics.uniforms.uSleep.set(0.55);
      // Contact skin — wider than half-float can lose at these magnitudes.
      physics.uniforms.uSkin.set(0.01);
      physics.uniforms.uBounceCut.set(0.9);
      physics.uniforms.uRepair.set(0.6);

      const shadow = createProgram(renderer, shadowShader);
      shadow.attributes.aPosition.set(ball.positions);
      shadow.setIndices(ball.indices);
      shadow.uniforms.uRadius.set(RADIUS);
      shadow.uniforms.uLightPos.set(LIGHT_POS);
      shadow.uniforms.uRange.set(LIGHT_RANGE);

      const floor = createProgram(renderer, floorShader);
      floor.attributes.aPosition.set(quad.positions);
      floor.setIndices(quad.indices);
      floor.uniforms.uBounds.set(BOUNDS);
      floor.uniforms.uLightPos.set(LIGHT_POS);
      floor.uniforms.uSkyTint.set([0.34, 0.4, 0.52]);
      floor.uniforms.uGroundTint.set([0.05, 0.05, 0.07]);
      floor.uniforms.uRange.set(LIGHT_RANGE);
      floor.uniforms.uTexel.set(1 / SHADOW_SIZE);
      floor.uniforms.uSoftness.set(1.4);
      // World units. Half-float stores distance to about 0.01 at this range,
      // so the bias clears the quantization and little else — a wider one eats
      // the contact shadow where a ball meets the floor.
      floor.uniforms.uBias.set(0.03);

      const balls = createProgram(renderer, ballsShader);
      balls.attributes.aPosition.set(ball.positions);
      balls.attributes.aNormal.set(ball.normals);
      balls.setIndices(ball.indices);
      balls.uniforms.uRadius.set(RADIUS);
      balls.uniforms.uLightPos.set(LIGHT_POS);
      balls.uniforms.uSkyTint.set([0.34, 0.4, 0.52]);
      balls.uniforms.uGroundTint.set([0.05, 0.05, 0.07]);
      balls.uniforms.uRange.set(LIGHT_RANGE);
      balls.uniforms.uTexel.set(1 / SHADOW_SIZE);
      balls.uniforms.uSoftness.set(1.2);
      balls.uniforms.uBias.set(0.035);

      const glass = createProgram(renderer, glassShader, { blend: 'alpha' });
      glass.attributes.aPosition.set(box.positions);
      glass.attributes.aNormal.set(box.normals);
      glass.setIndices(box.indices);
      glass.uniforms.uBounds.set(BOUNDS);
      glass.uniforms.uLightPos.set(LIGHT_POS);
      glass.uniforms.uSkyTint.set([0.5, 0.6, 0.78]);
      glass.uniforms.uHorizon.set([0.42, 0.5, 0.62]);
      // Float glass is green, and the tint is what stops it reading as plastic.
      glass.uniforms.uGlassTint.set([0.72, 0.94, 0.86]);
      glass.uniforms.uEdge.set(0.55);
      glass.uniforms.uGlare.set(1);
      // A little over the width of the tank, which is as far as a reflection
      // off one pane can usefully travel.
      glass.uniforms.uReach.set(4.2);
      // How far behind a recorded surface still counts as hitting it.
      glass.uniforms.uThickness.set(0.3);
      glass.uniforms.uMirror.set(1);

      const backdrop = createProgram(renderer, backdropShader);
      backdrop.attributes.aPosition.set(quad.positions);
      backdrop.attributes.aUv.set(quad.uvs);
      backdrop.setIndices(quad.indices);
      backdrop.uniforms.uTop.set([0.05, 0.06, 0.09]);
      backdrop.uniforms.uBottom.set([0.01, 0.01, 0.015]);
      backdrop.uniforms.uGlow.set([0.28, 0.32, 0.42]);

      const reseed = (spread: number): void => {
        seed.uniforms.uSpread.set(spread);
        renderer.drawTo(read, () => seed.draw());
      };

      // Changing the population resizes the state targets, so everything that
      // depends on the count is rebuilt together.
      const resize = (spread: number): void => {
        const n = countRef.current;
        read.dispose();
        write.dispose();
        read = createRenderTarget(renderer, { width: n * 2, height: 1 });
        write = createRenderTarget(renderer, { width: n * 2, height: 1 });
        seed.uniforms.uCount.set(n);
        physics.uniforms.uCount.set(n);
        const indices = new Float32Array(Array.from({ length: n }, (_, i) => i));
        balls.uniforms.uCount.set(n);
        balls.instanceAttributes.iIndex.set(indices);
        shadow.uniforms.uCount.set(n);
        shadow.instanceAttributes.iIndex.set(indices);
        reseed(spread);
      };
      resize(6);
      let builtAt = rebuildRef.current;

      // A copy of the scene for the glass to reflect. Sized from the drawing
      // buffer and rebuilt when that changes, since the march projects world
      // positions into it with the same matrix the screen uses.
      let sceneTarget: RenderTarget | null = null;
      let sceneW = 0;
      let sceneH = 0;
      const sizeScene = (): RenderTarget => {
        const w = Math.max(2, Math.round(renderer.canvas.width * SCENE_SCALE));
        const h = Math.max(2, Math.round(renderer.canvas.height * SCENE_SCALE));
        if (sceneTarget === null || w !== sceneW || h !== sceneH) {
          sceneTarget?.dispose();
          sceneTarget = createRenderTarget(renderer, { width: w, height: h, depth: true });
          sceneW = w;
          sceneH = h;
        }
        return sceneTarget;
      };

      const camera = createCamera({ position: [0, 1.4, 7.2], fovY: 0.85, near: 0.3, far: 40 });
      // Wide enough to hold the tank's bounding sphere from where the light
      // stands. Anything outside the cone reads as lit, so a tight fit here
      // buys resolution and a loose one costs nothing but sharpness.
      const lightCamera = createCamera({ position: LIGHT_POS, fovY: 0.62, near: 6, far: LIGHT_RANGE });
      lightCamera.lookAt(0, 0, 0);
      let last = 0;
      let carry = 0;
      let shakenAt = shakeRef.current;

      const stop = renderer.loop((t) => {
        tick(t);
        const frame = Math.min(t - last, 0.1);
        last = t;

        if (builtAt !== rebuildRef.current) {
          builtAt = rebuildRef.current;
          resize(6);
          carry = 0;
        }
        if (shakenAt !== shakeRef.current) {
          shakenAt = shakeRef.current;
          reseed(14);
          carry = 0;
        }

        // Fixed steps from an accumulator, so the simulation runs at the same
        // speed on a 60Hz panel and a 120Hz one.
        physics.uniforms.uRestitution.set(bounceRef.current);
        physics.uniforms.uGravity.set([0, -gravityRef.current, 0]);
        carry = Math.min(carry + frame, STEP * MAX_STEPS);
        while (carry >= STEP) {
          carry -= STEP;
          physics.uniforms.uState.set(read.texture);
          renderer.drawTo(write, () => physics.draw());
          const swap = read;
          read = write;
          write = swap;
        }

        // ── The balls as the light sees them ────────────────────────────
        // Square map, so the aspect is 1 — feeding the canvas aspect here
        // stretches the map and the shadows slide when the window resizes.
        const lightViewProj = lightCamera.viewProjection(1);
        shadow.uniforms.uLightViewProj.set(lightViewProj);
        shadow.uniforms.uState.set(read.texture);
        renderer.drawTo(
          shadowMap,
          () => shadow.draw(),
          // Cleared to the far end of the light's range, so texels no ball
          // covered report nothing in the way rather than an occluder at the
          // light itself.
          { clear: [1, 1, 1, 1] },
        );

        const angle = t * 0.16;
        const eye: [number, number, number] = [
          Math.sin(angle) * 7.4,
          2.1 + Math.sin(t * 0.11) * 0.5,
          Math.cos(angle) * 7.4,
        ];
        camera.setPosition(eye[0], eye[1], eye[2]);
        camera.lookAt(0, 0, 0);
        const viewProj = camera.viewProjection(renderer.aspect);

        floor.uniforms.uViewProj.set(viewProj);
        floor.uniforms.uViewPos.set(eye);
        floor.uniforms.uLightViewProj.set(lightViewProj);
        floor.uniforms.uShadowMap.set(shadowMap.texture);

        balls.uniforms.uViewProj.set(viewProj);
        balls.uniforms.uViewPos.set(eye);
        balls.uniforms.uState.set(read.texture);
        balls.uniforms.uLightViewProj.set(lightViewProj);
        balls.uniforms.uShadowMap.set(shadowMap.texture);

        // ── Everything but the glass, twice ─────────────────────────────────
        // Once off-screen for the glass to reflect, once to the screen. Drawing
        // it and blitting would be cheaper, but the target carries no MSAA and
        // the balls would come back with stepped silhouettes.
        const scene = sizeScene();
        renderer.drawTo(
          scene,
          () => {
            backdrop.draw();
            floor.draw();
            balls.draw();
          },
          // Alpha is distance, so an empty texel has to read as unreachably far
          // or the march treats the void as a surface.
          { clear: [0, 0, 0, 4000] },
        );

        backdrop.draw();
        floor.draw();
        balls.draw();

        glass.uniforms.uViewProj.set(viewProj);
        glass.uniforms.uViewPos.set(eye);
        glass.uniforms.uScene.set(scene.texture);
        glass.draw();
      });

      cleanup = () => {
        stop();
        read.dispose();
        write.dispose();
        shadowMap.dispose();
        sceneTarget?.dispose();
        seed.dispose();
        physics.dispose();
        shadow.dispose();
        floor.dispose();
        balls.dispose();
        glass.dispose();
        backdrop.dispose();
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
          <h1>Ball Physics</h1>
          <p className="panel-note">
            {count} balls, simulated entirely on the GPU. Position and velocity live in a float
            render target; each frame a fragment pass integrates them and resolves every contact,
            then the spheres read their own centres out of that texture in the vertex shader. The
            CPU uploads gravity and a timestep — nothing else. A shadow pass reads the same
            texture from the light&rsquo;s point of view, so the heap shadows itself without a
            single position ever coming back to the CPU. The glass reflects the pile by marching
            its reflected ray through an off-screen copy of the scene.
          </p>
          <div className="row">
            <label htmlFor="count">Balls</label>
            <input
              id="count"
              type="range"
              min={1}
              max={MAX_BALLS}
              step={1}
              value={count}
              onChange={(event) => {
                const value = Number(event.target.value);
                setCount(value);
                countRef.current = value;
                rebuildRef.current++;
              }}
            />
            <output htmlFor="count">{count}</output>
          </div>
          <div className="row">
            <label htmlFor="bounce">Bounce</label>
            <input
              id="bounce"
              type="range"
              min={0}
              max={0.95}
              step={0.01}
              value={bounce}
              onChange={(event) => {
                const value = Number(event.target.value);
                setBounce(value);
                bounceRef.current = value;
              }}
            />
            <output htmlFor="bounce">{bounce.toFixed(2)}</output>
          </div>
          <div className="row">
            <label htmlFor="gravity">Gravity</label>
            <input
              id="gravity"
              type="range"
              min={0}
              max={24}
              step={0.2}
              value={gravity}
              onChange={(event) => {
                const value = Number(event.target.value);
                setGravity(value);
                gravityRef.current = value;
              }}
            />
            <output htmlFor="gravity">{gravity.toFixed(1)}</output>
          </div>
          <button type="button" className="reset" onClick={() => shakeRef.current++}>
            Shake
          </button>
        </div>
      </div>
      <DemoStats stats={stats}>
        {count} balls · 4 GPU passes per frame: physics, shadow, scene copy, render
      </DemoStats>
      <BackendBadge backend={backend} />
    </>
  );
}
