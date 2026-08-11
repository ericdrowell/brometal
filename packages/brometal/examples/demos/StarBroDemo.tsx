"use client";

import { useEffect, useRef, useState } from "react";
import {
  createCamera,
  createCube,
  createPlane,
  createProgram,
  createRenderer,
  createStorageBuffer,
  createSphere,
  createTexture,
  loadGlb,
  loadTexture,
  mat4,
} from "brometal";
import DemoStats, { useFrameStats } from "@/components/DemoStats";
import modelShader from "@/shaders/model.shader.gen";
import rocksShader from "@/shaders/game-rocks.shader.gen";
import glowShader from "@/shaders/game-glow.shader.gen";
import plumeShader from "@/shaders/game-plume.shader.gen";
import starsShader from "@/shaders/game-stars.shader.gen";
import laserShader from "@/shaders/game-laser.shader.gen";
import reticleShader from "@/shaders/game-reticle.shader.gen";
import ErrorToast, { useBroMetalError } from "@/components/ErrorToast";

const ASTEROIDS = 33;
const WRAP = 210;
const STARS = 400;
const STAR_WRAP = 210;

export default function StarBroDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats, tick } = useFrameStats();
  const [started, setStarted] = useState(false);

  const { error, report, dismiss } = useBroMetalError();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const [renderer, ship] = await Promise.all([
        createRenderer(canvas, {
          onError: report,
          clearColor: [0, 0, 0, 1],
          cull: "back",
        }),
        loadGlb("/models/spitfire.glb"),
      ]);
      if (cancelled) {
        renderer.destroy();
        return;
      }

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
        new Blob([skin.data.slice() as unknown as BlobPart], {
          type: skin.mimeType,
        }),
      );
      const shipTexture = createTexture(renderer, bitmap, { flipY: false });
      shipProgram.uniforms.uTex.set(shipTexture);
      shipProgram.uniforms.uLightDir.set([0.5, 0.8, 0.4]);

      // Asteroid field: instanced spheres sculpted into lumpy rocks by radial
      // fbm3 noise in the vertex shader, wrapped on the GPU.
      const rocksProgram = createProgram(renderer, rocksShader);
      // Craters are carved by displacing vertices, so they only exist where
      // there are vertices to move — at 24x16 the sphere smoothed them away.
      const rock = createSphere({
        radius: 1,
        widthSegments: 56,
        heightSegments: 36,
      });
      rocksProgram.attributes.aPosition.set(rock.positions);
      rocksProgram.attributes.aUv.set(rock.uvs);
      rocksProgram.setIndices(rock.indices);
      const rockTexture = await loadTexture(
        renderer,
        "/textures/gravel043.jpg",
      );
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
        const gauss =
          (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
        const scale = Math.min(
          7.8,
          Math.max(0.6, 1.6 * Math.exp(0.55 * gauss)),
        );
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
            return (
              Math.sqrt(dx * dx + dy * dy + wrappedZ * wrappedZ) >
              radius + p.r + BUFFER
            );
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
      const dotsProgram = createProgram(renderer, glowShader, {
        blend: "additive",
      });
      const dot = createSphere({
        radius: 1,
        widthSegments: 6,
        heightSegments: 4,
      });
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
      const starsProgram = createProgram(renderer, starsShader, {
        blend: "additive",
      });
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

      // Engine plume: one stretched sphere shaded as a volume of light. No
      // particles and no per-frame buffer writes — the flame is a function of
      // time evaluated in the shader, and the same pulse lights the hull.
      // Measured from the mesh rather than guessed: the four engine nacelles
      // sit at x = ±0.60, z = 0.28, averaging y = -0.07, stacked in pairs. A
      // single plume on the fuselage centreline never looked attached because
      // there is no engine there — the ship's thrust comes from these four.
      // x is 0.58, just inboard of the 0.60 the vertex clusters average to:
      // that mean is pulled outboard by the nacelle casings, while what wants
      // lighting is the bore inside them. 0.55 overshot.
      const NACELLES: [number, number, number][] = [
        [-0.58, 0.02, 0.27],
        [-0.58, -0.16, 0.27],
        [0.58, 0.02, 0.27],
        [0.58, -0.16, 0.27],
      ];
      /** Centre of the four, for the point light the hull is lit by. */
      const ENGINE_OFFSET: [number, number, number] = [0, -0.07, 0.34];
      /** The flame's own outer bloom — still cool, it is plasma. */
      const ENGINE_COLOR: [number, number, number] = [0.42, 0.68, 1];
      /**
       * What the engines *cast* on other surfaces. White rather than the
       * flame's blue: a light this bright reads as white at the source, and
       * tinting everything it touches blue made lit rock look painted rather
       * than lit.
       */
      const ENGINE_LIGHT: [number, number, number] = [1, 1, 1];
      const plumeProgram = createProgram(renderer, plumeShader, {
        blend: "additive",
      });
      const plumeBall = createSphere({
        radius: 1,
        widthSegments: 20,
        heightSegments: 14,
      });
      plumeProgram.attributes.aPosition.set(plumeBall.positions);
      plumeProgram.setIndices(plumeBall.indices);
      plumeProgram.instanceAttributes.iOffset.set(
        new Float32Array(NACELLES.flat()),
      );
      // Near-spherical and sized to the nacelle bore (the rings span x 0.5-0.7,
      // so ~0.1 fills them). Stretching these along z read as a comet hanging
      // off the back; what should show is each cylinder lit from within.
      plumeProgram.uniforms.uSize.set([0.1, 0.1, 0.13]);
      plumeProgram.uniforms.uCore.set([1, 1, 1]);
      plumeProgram.uniforms.uEdge.set(ENGINE_COLOR);
      shipProgram.uniforms.uEngineColor.set(ENGINE_LIGHT);
      rocksProgram.uniforms.uEngineColor.set(ENGINE_LIGHT);

      // Laser bolts: a small ring buffer of instanced beams; each shot just
      // stamps start/direction/birth-time and the shader does the rest.
      const LASERS = 16;
      const laserProgram = createProgram(renderer, laserShader, {
        blend: "additive",
      });
      // A cube, not a sphere: the shader squashes it to a sliver and stretches
      // it along the flight path, the same recipe as the warp streaks.
      const bolt = createCube({ width: 1, height: 1, depth: 1 });
      laserProgram.attributes.aPosition.set(bolt.positions);
      laserProgram.setIndices(bolt.indices);
      const laserStarts = new Float32Array(LASERS * 3);
      const laserDirs = new Float32Array(LASERS * 3);
      const laserBirths = new Float32Array(LASERS).fill(-100);
      laserProgram.instanceAttributes.iStart.set(laserStarts);
      laserProgram.instanceAttributes.iDir.set(laserDirs);
      laserProgram.instanceAttributes.iBirth.set(laserBirths);
      // Shared with the CPU so each bolt's light sits exactly on the bolt.
      const BOLT_SPEED = 55;
      const BOLT_LIFE = 1.1;
      /** Half the segment's length, so the light rides its middle. */
      const BOLT_HALF = 2.25;
      laserProgram.uniforms.uSpeed.set(BOLT_SPEED);
      laserProgram.uniforms.uLife.set(BOLT_LIFE);

      // xyz = where the bolt is now, w = brightness. Read by the asteroids.
      const boltLights = new Float32Array(LASERS * 4);
      const boltBuffer = createStorageBuffer(renderer, boltLights);
      rocksProgram.uniforms.uBolts.set(boltBuffer);

      // Star Fox aiming reticles: two SDF square outlines along the aim ray.
      const reticleProgram = createProgram(renderer, reticleShader, {
        blend: "additive",
      });
      const reticleQuad = createPlane({ width: 2, height: 2 });
      reticleProgram.attributes.aPosition.set(reticleQuad.positions);
      reticleProgram.attributes.aUv.set(reticleQuad.uvs);
      reticleProgram.setIndices(reticleQuad.indices);
      reticleProgram.uniforms.uColor.set([0.5, 0.72, 1]);
      // Near bracket at 45% of the way to the crosshair, far one at the
      // crosshair itself. All three attributes are static.
      reticleProgram.instanceAttributes.iAlong.set(
        new Float32Array([0.45, 1]),
      );
      // Clip-space sizes, imitating the perspective that world space used to
      // supply: index 0 is the near bracket (larger), index 1 rides the cursor
      // and is the smaller, farther-looking one.
      reticleProgram.instanceAttributes.iSize.set(
        new Float32Array([0.09, 0.05]),
      );
      reticleProgram.instanceAttributes.iAlpha.set(
        new Float32Array([0.4, 0.7]),
      );

      // Everything aims off the same pointer, so it must be unprojected the
      // same way. At a given distance the visible half-height is
      // tan(fov/2) * distance, and half-width is that times the aspect.
      const FOV_Y = Math.PI / 4;
      const CAM_Z = 5.5;
      const HALF = Math.tan(FOV_Y / 2);
      /** Where the pointer points, on the plane `distance` in front of the camera. */
      const unproject = (
        ndcX: number,
        ndcY: number,
        distance: number,
        aspect: number,
      ): [number, number] => [
        ndcX * HALF * distance * aspect,
        ndcY * HALF * distance,
      ];

      // The camera drifts with the ship rather than tracking it. At the old 0.7
      // follow with lookAt aimed at the ship, the ship sat dead centre however
      // far it flew — it could not visibly reach the edges of the screen,
      // because the screen came with it.
      const FOLLOW = 0.12;
      /** How far ahead of the ship the aim plane sits. */
      const AIM_DEPTH = 12;

      /**
       * Where the cursor is pointing, in world space, on a plane AIM_DEPTH ahead.
       *
       * Built from the camera's own basis rather than by adding screen offsets
       * to the ship: the camera tilts down slightly and no longer sits above
       * the ship, so anything simpler misses by more the further you aim from
       * centre. Recomputed once per frame and used by both the nose and the
       * guns, which have to agree or the ship visibly aims off its own shots.
       */
      let aimPx = 0;
      let aimPy = 0;
      let aimPz = -AIM_DEPTH;
      const updateAimPoint = (aspect: number): void => {
        const camX = shipX * FOLLOW;
        const camY = shipY * FOLLOW + 0.9;
        // Forward, from the camera to what it looks at.
        let fx = 0;
        let fy = shipY * FOLLOW - 0.65 - camY;
        let fz = -4 - CAM_Z;
        const fl = Math.hypot(fx, fy, fz);
        fx /= fl;
        fy /= fl;
        fz /= fl;
        // right = normalize(cross(f, worldUp)) = (-fz, 0, fx) for up = (0,1,0).
        // Negating this — as an earlier version did — mirrors the horizontal
        // axis, and because `up` is derived from it the vertical mirrors too, so
        // the shot goes to the opposite corner from the cursor.
        let rx = 0 - fz;
        let ry = 0;
        let rz = fx;
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx /= rl;
        ry /= rl;
        rz /= rl;
        const ux = ry * fz - rz * fy;
        const uy = rz * fx - rx * fz;
        const uz = rx * fy - ry * fx;

        const d = CAM_Z + AIM_DEPTH;
        const sx = cursorX * HALF * d * aspect;
        const sy = cursorY * HALF * d;
        aimPx = camX + fx * d + rx * sx + ux * sy;
        aimPy = camY + fy * d + ry * sx + uy * sy;
        aimPz = CAM_Z + fz * d + rz * sx + uz * sy;
      };

      const camera = createCamera({ position: [0, 1.1, 4.2] });

      // Clicking the canvas takes the mouse (pointer lock) and Escape gives it
      // back, exactly as Brocraft does. Locked, there is no cursor position to
      // read — only deltas — so the pointer accumulates movement in screen
      // pixels and everything else is derived from where it ends up.
      let targetX = 0;
      let targetY = 0;
      // The reticle's own position, in NDC. Kept separate from the ship's aim
      // because it has to track the pointer 1:1 in *pixels* — a mouse moved 10
      // screen pixels moves this 10 screen pixels — while the ship keeps its
      // own eased, world-space feel.
      let cursorX = 0;
      let cursorY = 0;
      let playing = false;
      const onPointerMove = (event: PointerEvent): void => {
        if (!playing) return;
        // NDC spans -1..1 across the canvas, so one CSS pixel is 2/size.
        const w = Math.max(canvas.clientWidth, 1);
        const h = Math.max(canvas.clientHeight, 1);
        cursorX = Math.max(-1, Math.min(1, cursorX + (event.movementX * 2) / w));
        cursorY = Math.max(-1, Math.min(1, cursorY - (event.movementY * 2) / h));
      };
      const onClick = (): void => void canvas.requestPointerLock();
      const onLockChange = (): void => {
        playing = document.pointerLockElement === canvas;
        setStarted(playing);
        if (!playing) {
          // Let the ship glide home rather than parking off to one side under
          // the prompt; re-locking then starts centred.
          targetX = 0;
          targetY = 0;
          cursorX = 0;
          cursorY = 0;
        }
      };
      window.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("click", onClick);
      document.addEventListener("pointerlockchange", onLockChange);

      let shipX = 0;
      let shipY = 0;
      let vx = 0;
      let vy = 0;
      let lastT = 0;
      // World time, which only advances while the pointer is locked. The
      // scroll, the plumes and the laser ages are all driven from this rather
      // than the frame clock, so releasing the mouse stops the corridor dead
      // instead of leaving it flying past an unresponsive ship.
      let clock = 0;
      const model = mat4.scratch();
      const yawM = mat4.scratch();
      const pitchM = mat4.scratch();
      const bankM = mat4.scratch();

      // Bolts fly at whatever the pointer is over, not at wherever the ship
      // happens to be heading. That is the whole point of a free cursor: you can
      // hold course and still shoot something below or beside you.
      let laserSlot = 0;
      const onPointerDown = (): void => {
        if (!playing) return;
        // Where the bolts meet: along the line of sight from the ship's centre
        // through the reticle, but carried twice as far. Converging *at* the
        // reticle makes the pair cross right where you are looking, which reads
        // as cross-eyed; pushing the crossing point past it keeps the two bolts
        // running near-parallel through the target instead.
        const CONVERGE = 2;
        const fireX = shipX + (aimPx - shipX) * CONVERGE;
        const fireY = shipY + (aimPy - shipY) * CONVERGE;
        const fireZ = aimPz * CONVERGE;

        // Nominal heading, used only to place the muzzles on the ship's wings.
        const dx = aimPx - shipX;
        const dy = aimPy - shipY;
        const inv = 1 / Math.hypot(dx, dy, AIM_DEPTH);
        const dirX = dx * inv;
        const dirY = dy * inv;
        const dirZ = -AIM_DEPTH * inv;
        const rl = Math.hypot(dirZ, dirX);
        const rightX = -dirZ / rl;
        const rightZ = dirX / rl;

        for (const side of [-1, 1]) {
          const i = laserSlot;
          laserSlot = (laserSlot + 1) % LASERS;
          // Origin unchanged: one muzzle per wing. Measured hull — the nose is
          // at z = -0.571, so firing from there keeps the bolt clear of the ship.
          const mx = shipX + rightX * 0.5 * side + dirX * 0.3;
          const my = shipY - 0.05;
          const mz = -0.55 + rightZ * 0.5 * side + dirZ * 0.3;
          laserStarts[i * 3] = mx;
          laserStarts[i * 3 + 1] = my;
          laserStarts[i * 3 + 2] = mz;

          // Aim each bolt from its own muzzle at the convergence point. Sharing
          // one direction sent both wings along parallel rays offset from the
          // aim point, so the shots bracketed the target and never met it.
          const tx = fireX - mx;
          const ty = fireY - my;
          const tz = fireZ - mz;
          const tl = Math.hypot(tx, ty, tz) || 1;
          laserDirs[i * 3] = tx / tl;
          laserDirs[i * 3 + 1] = ty / tl;
          laserDirs[i * 3 + 2] = tz / tl;
          laserBirths[i] = clock;
        }
        laserProgram.instanceAttributes.iStart.set(laserStarts);
        laserProgram.instanceAttributes.iDir.set(laserDirs);
        laserProgram.instanceAttributes.iBirth.set(laserBirths);
      laserProgram.uniforms.uColor.set([0.25, 0.6, 1]);
      };
      canvas.addEventListener("pointerdown", onPointerDown);

      const stop = renderer.loop((t) => {
        tick(t);

        const dt = playing ? Math.min(t - lastT, 0.05) : 0;
        lastT = t;
        clock += dt;

        // The reachable area is whatever is on screen at the ship's depth, so
        // the ship can fly to any corner instead of being boxed into a fixed
        // rectangle that had nothing to do with the viewport.
        const [reachX, reachY] = unproject(1, 1, CAM_Z, renderer.aspect);
        targetX = cursorX * reachX;
        targetY = cursorY * reachY;

        // Damped spring toward the cursor — same feel as the old thrust,
        // but the "input" is the distance left to cover.
        vx += ((targetX - shipX) * 12 - vx * 6) * dt;
        vy += ((targetY - shipY) * 12 - vy * 6) * dt;
        shipX = Math.max(-reachX, Math.min(reachX, shipX + vx * dt));
        shipY = Math.max(-reachY, Math.min(reachY, shipY + vy * dt));

        // Ship model: translate, aim the nose at the cursor's corridor spot,
        // then bank with steering.
        updateAimPoint(renderer.aspect);
        const aimYaw = -Math.atan2(aimPx - shipX, AIM_DEPTH);
        const aimPitch = Math.atan2(aimPy - shipY, AIM_DEPTH);
        mat4.translation(shipX, shipY, 0, model);
        mat4.multiply(model, mat4.rotationY(aimYaw, yawM), model);
        mat4.multiply(
          model,
          mat4.rotationX(0.08 + aimPitch + vy * 0.03, pitchM),
          model,
        );
        mat4.multiply(model, mat4.rotationZ(-vx * 0.09, bankM), model);

        camera.setPosition(shipX * FOLLOW, shipY * FOLLOW + 0.9, CAM_Z);
        shipProgram.uniforms.uViewPos.set([
          shipX * FOLLOW,
          shipY * FOLLOW + 0.9,
          CAM_Z,
        ]);
        camera.lookAt(shipX * FOLLOW, shipY * FOLLOW - 0.65, -4);
        const viewProj = camera.viewProjection(renderer.aspect);

        // Engine flicker: one scalar, shared by the plume and the hull so the
        // flame and the light it casts cannot disagree. Two sine terms at
        // unrelated rates read as combustion rather than a pulse.
        const pulse =
          0.82 + Math.sin(clock * 37.1) * 0.07 + Math.sin(clock * 13.3) * 0.11;

        // The nozzle in world space, for the ship's point light: column-major,
        // so the basis vectors are columns 0-2 and the translation is column 3.
        const [ox, oy, oz] = ENGINE_OFFSET;
        const engineX = model[0]! * ox + model[4]! * oy + model[8]! * oz + model[12]!;
        const engineY = model[1]! * ox + model[5]! * oy + model[9]! * oz + model[13]!;
        const engineZ = model[2]! * ox + model[6]! * oy + model[10]! * oz + model[14]!;
        shipProgram.uniforms.uEnginePos.set([engineX, engineY, engineZ]);
        shipProgram.uniforms.uPulse.set(pulse);
        // Same light, so rocks the ship passes brighten in step with the hull.
        rocksProgram.uniforms.uEnginePos.set([engineX, engineY, engineZ]);
        rocksProgram.uniforms.uPulse.set(pulse);

        dotsProgram.uniforms.uViewProj.set(viewProj);
        dotsProgram.draw();

        starsProgram.uniforms.uViewProj.set(viewProj);
        starsProgram.uniforms.uScroll.set(clock * 46);
        starsProgram.draw();

        // Advance each bolt's light along its own flight path. Slots holding a
        // spent shot fall to zero brightness and stop lighting anything.
        for (let i = 0; i < LASERS; i++) {
          const age = clock - laserBirths[i]!;
          const alive =
            Math.max(0, Math.min(1, age * 60)) *
            Math.max(0, Math.min(1, (BOLT_LIFE - age) * 4));
          const travel = age * BOLT_SPEED + BOLT_HALF;
          boltLights[i * 4] = laserStarts[i * 3]! + laserDirs[i * 3]! * travel;
          boltLights[i * 4 + 1] = laserStarts[i * 3 + 1]! + laserDirs[i * 3 + 1]! * travel;
          boltLights[i * 4 + 2] = laserStarts[i * 3 + 2]! + laserDirs[i * 3 + 2]! * travel;
          boltLights[i * 4 + 3] = alive;
        }
        boltBuffer.write(boltLights);

        rocksProgram.uniforms.uViewProj.set(viewProj);
        rocksProgram.uniforms.uScroll.set(clock * 9);
        rocksProgram.uniforms.uTime.set(clock);
        rocksProgram.draw();

        shipProgram.uniforms.uViewProj.set(viewProj);
        shipProgram.uniforms.uModel.set(model);
        shipProgram.draw();

        plumeProgram.uniforms.uViewProj.set(viewProj);
        plumeProgram.uniforms.uModel.set(model);
        plumeProgram.uniforms.uViewPos.set([shipX * 0.7, shipY * 0.7 + 0.9, 5.5]);
        plumeProgram.uniforms.uTime.set(clock);
        plumeProgram.uniforms.uPulse.set(pulse);
        plumeProgram.draw();

        laserProgram.uniforms.uViewProj.set(viewProj);
        laserProgram.uniforms.uTime.set(clock);
        laserProgram.draw();

        // Project the ship into the same coordinates the cursor lives in, so
        // the near bracket can sit on the line between them. Column-major, and
        // the perspective divide is what turns clip space into NDC.
        const clipX =
          viewProj[0]! * shipX + viewProj[4]! * shipY + viewProj[12]!;
        const clipY =
          viewProj[1]! * shipX + viewProj[5]! * shipY + viewProj[13]!;
        const clipW =
          viewProj[3]! * shipX + viewProj[7]! * shipY + viewProj[15]!;
        const safeW = Math.abs(clipW) < 1e-4 ? 1e-4 : clipW;
        reticleProgram.uniforms.uShip.set([clipX / safeW, clipY / safeW]);
        reticleProgram.uniforms.uCursor.set([cursorX, cursorY]);
        reticleProgram.uniforms.uAspect.set(renderer.aspect);
        reticleProgram.draw();
      });

      cleanup = () => {
        stop();
        window.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("click", onClick);
        document.removeEventListener("pointerlockchange", onLockChange);
        canvas.removeEventListener("pointerdown", onPointerDown);
        shipTexture.dispose();
        rockTexture.dispose();
        shipProgram.dispose();
        rocksProgram.dispose();
        starsProgram.dispose();
        dotsProgram.dispose();
        plumeProgram.dispose();
        laserProgram.dispose();
        boltBuffer.dispose();
        reticleProgram.dispose();
        renderer.destroy();
      };
    })().catch(report);

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
          <h1>Star Bro</h1>
          <p className="panel-note">
            An instanced asteroid field with shader-drawn lasers and a follow
            camera. Every rock is one draw call; the bolts light the rocks they
            pass through from a storage buffer.
          </p>
          <h2>Controls</h2>
          <p className="panel-note">
            Click the scene to play · move the mouse to fly · click to fire · Esc
            to pause.
          </p>
        </div>
      </div>
      <DemoStats stats={stats}>
        Instanced asteroids, shader lasers, follow camera
      </DemoStats>
      <ErrorToast error={error} onDismiss={dismiss} />
    </>
  );
}
