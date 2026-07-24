'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createCone,
  createProgram,
  createRenderer,
  createSphere,
  mat4,
  type RendererBackend,
} from 'brometal';
import BackendBadge from '@/components/BackendBadge';
import litShader from '@/shaders/game-lit.shader.gen';
import rocksShader from '@/shaders/game-rocks.shader.gen';
import glowShader from '@/shaders/game-glow.shader.gen';

const ASTEROIDS = 140;
const WRAP = 70;
const PARTICLES = 14;

export default function StarfighterDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, { clearColor: [0.03, 0.03, 0.07, 1], cull: 'back' });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      // Ship: a cone, nose rotated toward -z, banked by steering.
      const shipProgram = createProgram(renderer, litShader);
      const cone = createCone({ radius: 0.24, height: 1.25, radialSegments: 24 });
      shipProgram.attributes.aPosition.set(cone.positions);
      shipProgram.attributes.aNormal.set(cone.normals);
      shipProgram.setIndices(cone.indices);
      shipProgram.uniforms.uColor.set([0.75, 0.8, 0.95]);
      shipProgram.uniforms.uLightDir.set([0.5, 0.8, 0.4]);

      // Asteroid field: instanced low-poly spheres, wrapped on the GPU.
      const rocksProgram = createProgram(renderer, rocksShader);
      const rock = createSphere({ radius: 1, widthSegments: 7, heightSegments: 5 });
      rocksProgram.attributes.aPosition.set(rock.positions);
      rocksProgram.attributes.aNormal.set(rock.normals);
      rocksProgram.setIndices(rock.indices);
      const offsets = new Float32Array(ASTEROIDS * 3);
      const scales = new Float32Array(ASTEROIDS);
      const seeds = new Float32Array(ASTEROIDS);
      for (let i = 0; i < ASTEROIDS; i++) {
        offsets[i * 3] = (Math.random() * 2 - 1) * 9;
        offsets[i * 3 + 1] = (Math.random() * 2 - 1) * 4.5;
        offsets[i * 3 + 2] = Math.random() * WRAP;
        scales[i] = 0.25 + Math.random() * 0.75;
        seeds[i] = Math.random();
      }
      rocksProgram.instanceAttributes.iOffset.set(offsets);
      rocksProgram.instanceAttributes.iScale.set(scales);
      rocksProgram.instanceAttributes.iSeed.set(seeds);
      rocksProgram.uniforms.uWrap.set(WRAP);
      rocksProgram.uniforms.uAhead.set(2);
      rocksProgram.uniforms.uLightDir.set([0.5, 0.8, 0.4]);

      // Engine glow: additive-blended instanced blobs trailing the ship.
      const glowProgram = createProgram(renderer, glowShader, { blend: 'additive' });
      const blob = createSphere({ radius: 1, widthSegments: 8, heightSegments: 6 });
      glowProgram.attributes.aPosition.set(blob.positions);
      glowProgram.setIndices(blob.indices);
      glowProgram.uniforms.uColor.set([0.45, 0.7, 1]);
      const trail = Array.from({ length: PARTICLES }, () => ({ x: 0, y: 0, z: 2, age: Math.random() }));
      const trailOffsets = new Float32Array(PARTICLES * 3);
      const trailScales = new Float32Array(PARTICLES);
      const trailAlphas = new Float32Array(PARTICLES);

      const camera = createCamera({ position: [0, 1.1, 4.2] });

      const keys = new Set<string>();
      const onKeyDown = (event: KeyboardEvent): void => {
        keys.add(event.key.toLowerCase());
        if (event.key.startsWith('Arrow')) event.preventDefault();
      };
      const onKeyUp = (event: KeyboardEvent): void => {
        keys.delete(event.key.toLowerCase());
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      let shipX = 0;
      let shipY = 0;
      let vx = 0;
      let vy = 0;
      let lastT = 0;
      const model = mat4.scratch();
      const pitchM = mat4.scratch();
      const bankM = mat4.scratch();

      const stop = renderer.loop((t) => {
        const dt = Math.min(t - lastT, 0.05);
        lastT = t;

        const left = keys.has('arrowleft') || keys.has('a') ? 1 : 0;
        const right = keys.has('arrowright') || keys.has('d') ? 1 : 0;
        const up = keys.has('arrowup') || keys.has('w') ? 1 : 0;
        const down = keys.has('arrowdown') || keys.has('s') ? 1 : 0;
        vx += ((right - left) * 14 - vx * 6) * dt;
        vy += ((up - down) * 12 - vy * 6) * dt;
        shipX = Math.max(-6, Math.min(6, shipX + vx * dt));
        shipY = Math.max(-3, Math.min(3, shipY + vy * dt));

        // Ship model: translate, bank with steering, nose forward (-z).
        mat4.translation(shipX, shipY, 0, model);
        mat4.multiply(model, mat4.rotationZ(-vx * 0.09, bankM), model);
        mat4.multiply(model, mat4.rotationX(-Math.PI / 2 + 0.24 + vy * 0.05, pitchM), model);

        camera.setPosition(shipX * 0.7, shipY * 0.7 + 1.9, 4.6);
        camera.lookAt(shipX, shipY - 0.4, -4);
        const viewProj = camera.viewProjection(renderer.aspect);

        rocksProgram.uniforms.uViewProj.set(viewProj);
        rocksProgram.uniforms.uScroll.set(t * 9);
        rocksProgram.uniforms.uTime.set(t);
        rocksProgram.draw();

        shipProgram.uniforms.uViewProj.set(viewProj);
        shipProgram.uniforms.uModel.set(model);
        shipProgram.draw();

        // Trail particles: respawn at the ship tail, drift back, fade out.
        for (let i = 0; i < PARTICLES; i++) {
          const p = trail[i]!;
          p.age += dt * 3.2;
          p.z += dt * 1.6;
          if (p.age >= 1) {
            p.age = 0;
            p.x = shipX + (Math.random() - 0.5) * 0.08;
            p.y = shipY + (Math.random() - 0.5) * 0.08;
            p.z = 0.6;
          }
          trailOffsets[i * 3] = p.x;
          trailOffsets[i * 3 + 1] = p.y;
          trailOffsets[i * 3 + 2] = p.z;
          trailScales[i] = 0.09 * (1 - p.age) + 0.02;
          trailAlphas[i] = 0.4 * (1 - p.age);
        }
        glowProgram.instanceAttributes.iOffset.set(trailOffsets);
        glowProgram.instanceAttributes.iScale.set(trailScales);
        glowProgram.instanceAttributes.iAlpha.set(trailAlphas);
        glowProgram.uniforms.uViewProj.set(viewProj);
        glowProgram.draw();
      });

      cleanup = () => {
        stop();
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        shipProgram.dispose();
        rocksProgram.dispose();
        glowProgram.dispose();
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
      <div className="hud">
        <strong>Starfighter</strong>
        <br />
        WASD / arrow keys to fly — instanced asteroids, additive engine trail, follow camera
      </div>
      <BackendBadge backend={backend} />
    </>
  );
}
