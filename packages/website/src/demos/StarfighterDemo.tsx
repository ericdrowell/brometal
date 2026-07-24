'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createCube,
  createProgram,
  createRenderer,
  createSphere,
  createTexture,
  loadGlb,
  loadTexture,
  mat4,
  type RendererBackend,
} from 'brometal';
import BackendBadge from '@/components/BackendBadge';
import modelShader from '@/shaders/model.shader.gen';
import rocksShader from '@/shaders/game-rocks.shader.gen';
import glowShader from '@/shaders/game-glow.shader.gen';
import starsShader from '@/shaders/game-stars.shader.gen';

const ASTEROIDS = 33;
const WRAP = 210;
const PARTICLES = 70;
const STARS = 400;
const STAR_WRAP = 210;

export default function StarfighterDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const [renderer, ship] = await Promise.all([
        createRenderer(canvas, { clearColor: [0, 0, 0, 1], cull: 'back' }),
        loadGlb('/models/spitfire.glb'),
      ]);
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      // Ship: the Spitfire glb, banked by steering. The mesh is authored nose
      // toward +z at a ~10-unit wingspan, so bake a 180° yaw and game scale
      // into the vertex data — the per-frame matrix stays translate/bank/pitch.
      const shipProgram = createProgram(renderer, modelShader);
      const mesh = ship.meshes[0]!;
      const SHIP_SCALE = 0.13;
      const positions = new Float32Array(mesh.positions);
      const normals = new Float32Array(mesh.normals!);
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] = -positions[i] * SHIP_SCALE;
        positions[i + 1] = positions[i + 1] * SHIP_SCALE;
        positions[i + 2] = -positions[i + 2] * SHIP_SCALE;
        normals[i] = -normals[i]!;
        normals[i + 2] = -normals[i + 2]!;
      }
      shipProgram.attributes.aPosition.set(positions);
      shipProgram.attributes.aNormal.set(normals);
      shipProgram.attributes.aUv.set(mesh.uvs!);
      shipProgram.setIndices(mesh.indices!);
      const skin = ship.images[mesh.imageIndex!]!;
      const bitmap = await createImageBitmap(
        new Blob([skin.data.slice() as unknown as BlobPart], { type: skin.mimeType }),
      );
      const shipTexture = createTexture(renderer, bitmap, { flipY: false });
      shipProgram.uniforms.uTex.set(shipTexture);
      shipProgram.uniforms.uLightDir.set([0.5, 0.8, 0.4]);

      // Asteroid field: instanced spheres sculpted into lumpy rocks by radial
      // fbm3 noise in the vertex shader, wrapped on the GPU.
      const rocksProgram = createProgram(renderer, rocksShader);
      const rock = createSphere({ radius: 1, widthSegments: 24, heightSegments: 16 });
      rocksProgram.attributes.aPosition.set(rock.positions);
      rocksProgram.attributes.aUv.set(rock.uvs);
      rocksProgram.setIndices(rock.indices);
      const rockTexture = await loadTexture(renderer, '/textures/gravel043.jpg');
      rocksProgram.uniforms.uTex.set(rockTexture);
      const offsets = new Float32Array(ASTEROIDS * 3);
      const scales = new Float32Array(ASTEROIDS);
      const seeds = new Float32Array(ASTEROIDS);
      // All rocks scroll at the same speed, so relative spacing is permanent:
      // rejection-sample spawn spots (z measured around the wrap loop) so no
      // two rocks ever overlap, with a safety buffer between surfaces.
      const BUFFER = 1.5;
      const placed: { x: number; y: number; z: number; r: number }[] = [];
      for (let i = 0; i < ASTEROIDS; i++) {
        // Log-normal bell curve: most rocks cluster near 1.6, some run a bit
        // smaller, and the right tail keeps the occasional 5+ unit giant.
        const gauss = (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
        const scale = Math.min(7.8, Math.max(0.6, 1.6 * Math.exp(0.55 * gauss)));
        const radius = scale * 1.3;
        let x = 0;
        let y = 0;
        let z = 0;
        for (let attempt = 0; attempt < 300; attempt++) {
          x = (Math.random() * 2 - 1) * 9;
          y = (Math.random() * 2 - 1) * 4.5;
          z = Math.random() * WRAP;
          const zz = z;
          const clear = placed.every((p) => {
            const dz = Math.abs(zz - p.z);
            const wrappedZ = Math.min(dz, WRAP - dz);
            const dx = x - p.x;
            const dy = y - p.y;
            return Math.sqrt(dx * dx + dy * dy + wrappedZ * wrappedZ) > radius + p.r + BUFFER;
          });
          if (clear) break;
        }
        placed.push({ x, y, z, r: radius });
        offsets[i * 3] = x;
        offsets[i * 3 + 1] = y;
        offsets[i * 3 + 2] = z;
        scales[i] = scale;
        seeds[i] = Math.random();
      }
      rocksProgram.instanceAttributes.iOffset.set(offsets);
      rocksProgram.instanceAttributes.iScale.set(scales);
      rocksProgram.instanceAttributes.iSeed.set(seeds);
      rocksProgram.uniforms.uWrap.set(WRAP);
      // Recycle asteroids only once they're fully past the camera (z ≈ 4.6),
      // with margin for the largest displaced rocks (~10 world units).
      rocksProgram.uniforms.uAhead.set(16);
      rocksProgram.uniforms.uLightDir.set([0.5, 0.8, 0.4]);

      // Distant starfield: stationary pinprick dots behind the whole rock
      // corridor, so even the farthest silhouettes have stars to occlude.
      const DOTS = 700;
      const dotsProgram = createProgram(renderer, glowShader, { blend: 'additive' });
      const dot = createSphere({ radius: 1, widthSegments: 6, heightSegments: 4 });
      dotsProgram.attributes.aPosition.set(dot.positions);
      dotsProgram.setIndices(dot.indices);
      dotsProgram.uniforms.uColor.set([0.85, 0.88, 1]);
      const dotOffsets = new Float32Array(DOTS * 3);
      const dotScales = new Float32Array(DOTS);
      const dotAlphas = new Float32Array(DOTS);
      for (let i = 0; i < DOTS; i++) {
        dotOffsets[i * 3] = (Math.random() * 2 - 1) * 180;
        dotOffsets[i * 3 + 1] = (Math.random() * 2 - 1) * 100;
        dotOffsets[i * 3 + 2] = -220 - Math.random() * 100;
        dotScales[i] = 0.15 + Math.random() * 0.45;
        dotAlphas[i] = 0.25 + Math.random() * 0.75;
      }
      dotsProgram.instanceAttributes.iOffset.set(dotOffsets);
      dotsProgram.instanceAttributes.iScale.set(dotScales);
      dotsProgram.instanceAttributes.iAlpha.set(dotAlphas);

      // Warp tunnel: instanced star streaks in a tube around the corridor,
      // additive-blended and much faster than the rocks.
      const starsProgram = createProgram(renderer, starsShader, { blend: 'additive' });
      const streak = createCube({ width: 1, height: 1, depth: 1 });
      starsProgram.attributes.aPosition.set(streak.positions);
      starsProgram.setIndices(streak.indices);
      const starOffsets = new Float32Array(STARS * 3);
      const starLens = new Float32Array(STARS);
      const starSeeds = new Float32Array(STARS);
      for (let i = 0; i < STARS; i++) {
        // A ring around the playfield so the lines surround the flight path.
        const angle = Math.random() * Math.PI * 2;
        const radius = 5 + Math.random() * 13;
        starOffsets[i * 3] = Math.cos(angle) * radius;
        starOffsets[i * 3 + 1] = Math.sin(angle) * radius * 0.7;
        starOffsets[i * 3 + 2] = Math.random() * STAR_WRAP;
        starLens[i] = 1.5 + Math.random() * 3;
        starSeeds[i] = Math.random();
      }
      starsProgram.instanceAttributes.iOffset.set(starOffsets);
      starsProgram.instanceAttributes.iLen.set(starLens);
      starsProgram.instanceAttributes.iSeed.set(starSeeds);
      starsProgram.uniforms.uWrap.set(STAR_WRAP);
      starsProgram.uniforms.uAhead.set(14);
      starsProgram.uniforms.uColor.set([1, 1, 1]);

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

      // The ship chases the cursor: pointer position maps to the playfield.
      let targetX = 0;
      let targetY = 0;
      const onPointerMove = (event: PointerEvent): void => {
        targetX = (event.clientX / window.innerWidth - 0.5) * 2 * 6;
        targetY = -(event.clientY / window.innerHeight - 0.5) * 2 * 3;
      };
      // When the cursor leaves the window, glide back to the home position.
      const onPointerLeave = (): void => {
        targetX = 0;
        targetY = 0;
      };
      window.addEventListener('pointermove', onPointerMove);
      document.documentElement.addEventListener('pointerleave', onPointerLeave);

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

        // Damped spring toward the cursor — same feel as the old thrust,
        // but the "input" is the distance left to cover.
        vx += ((targetX - shipX) * 12 - vx * 6) * dt;
        vy += ((targetY - shipY) * 12 - vy * 6) * dt;
        shipX = Math.max(-6, Math.min(6, shipX + vx * dt));
        shipY = Math.max(-3, Math.min(3, shipY + vy * dt));

        // Ship model: translate, bank with steering, pitch with climb.
        mat4.translation(shipX, shipY, 0, model);
        mat4.multiply(model, mat4.rotationZ(-vx * 0.09, bankM), model);
        mat4.multiply(model, mat4.rotationX(0.1 + vy * 0.05, pitchM), model);

        // Chase cam: sit low and close behind the ship, just slightly above,
        // with the ship centered in frame.
        camera.setPosition(shipX * 0.7, shipY * 0.7 + 0.9, 5.5);
        shipProgram.uniforms.uViewPos.set([shipX * 0.7, shipY * 0.7 + 0.9, 5.5]);
        camera.lookAt(shipX, shipY - 0.65, -4);
        const viewProj = camera.viewProjection(renderer.aspect);

        dotsProgram.uniforms.uViewProj.set(viewProj);
        dotsProgram.draw();

        starsProgram.uniforms.uViewProj.set(viewProj);
        starsProgram.uniforms.uScroll.set(t * 46);
        starsProgram.draw();

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
          // Denser overlap (70 additive blobs) needs dimmer individuals to
          // keep the plume's total brightness in range.
          trailAlphas[i] = 0.14 * (1 - p.age);
        }
        glowProgram.instanceAttributes.iOffset.set(trailOffsets);
        glowProgram.instanceAttributes.iScale.set(trailScales);
        glowProgram.instanceAttributes.iAlpha.set(trailAlphas);
        glowProgram.uniforms.uViewProj.set(viewProj);
        glowProgram.draw();
      });

      cleanup = () => {
        stop();
        window.removeEventListener('pointermove', onPointerMove);
        document.documentElement.removeEventListener('pointerleave', onPointerLeave);
        shipTexture.dispose();
        rockTexture.dispose();
        shipProgram.dispose();
        rocksProgram.dispose();
        starsProgram.dispose();
        dotsProgram.dispose();
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
        Move the mouse to fly — instanced asteroids, additive engine trail, follow camera
      </div>
      <BackendBadge backend={backend} />
    </>
  );
}
