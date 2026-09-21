'use client';

import { useEffect, useRef } from 'react';
import {
  createProgram,
  createRenderer,
  createStorageBuffer,
  createTeapot,
  mat4,
  type Geometry,
} from 'brometal';
import clusterShader from '../shaders/nanite-style.shader.gen';
import cullShader from '../shaders/nanite-cull.shader.gen';
import DemoStats, { useFrameStats } from './_site/DemoStats';
import ErrorToast, { useBroMetalError } from './_site/ErrorToast';

interface ExpandedGeometry {
  positions: Float32Array;
  colours: Float32Array;
  triangles: number;
}

const PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0.31, 0.962, 0.642], [0.849, 0.294, 0.473], [0.266, 0.517, 0.25],
  [0.746, 0.558, 0.962], [0.837, 0.432, 0.636], [0.291, 0.62, 0.448],
  [0.533, 0.78, 0.78], [0.442, 0.947, 0.796], [0.58, 0.288, 0.36],
  [0.539, 0.708, 0.853], [0.304, 0.95, 0.426], [0.708, 0.947, 0.79],
  [0.887, 0.727, 0.448], [0.263, 0.407, 0.36], [0.325, 0.733, 0.724],
  [0.351, 0.94, 0.489],
];

const FIELD_COLUMNS = 400;
const FIELD_ROWS = 400;
const SOURCE_INSTANCE_COUNT = FIELD_COLUMNS * FIELD_ROWS;

function hash(value: number): number {
  return Math.abs(Math.sin(value * 127.1) * 43758.5453) % 1;
}

/**
 * Expand indexed geometry so every triangle can carry one cluster colour.
 * The Utah teapot's 32 Bézier patches are shared by every LOD, so their clean
 * boundaries neither zig-zag through triangles nor pop as detail changes.
 */
function expandClusters(geometry: Geometry): ExpandedGeometry {
  const positions = new Float32Array(geometry.indices.length * 3);
  const colours = new Float32Array(geometry.indices.length * 3);
  const triangles = geometry.indices.length / 3;
  const verticesPerPatch = geometry.positions.length / 3 / 32;

  for (let triangle = 0; triangle < triangles; triangle++) {
    for (let corner = 0; corner < 3; corner++) {
      const sourceVertex = geometry.indices[triangle * 3 + corner]!;
      const source = sourceVertex * 3;
      const target = (triangle * 3 + corner) * 3;
      const patch = Math.floor(sourceVertex / verticesPerPatch);
      const colour = PALETTE[Math.floor(hash(patch + 1) * PALETTE.length)]!;
      positions[target] = geometry.positions[source]!;
      positions[target + 1] = geometry.positions[source + 1]!;
      positions[target + 2] = geometry.positions[source + 2]!;
      colours[target] = colour[0];
      colours[target + 1] = colour[1];
      colours[target + 2] = colour[2];
    }
  }
  return { positions, colours, triangles };
}

export default function NaniteStyleDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats, tick } = useFrameStats();
  const { error, report, dismiss } = useBroMetalError();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, {
        onError: report,
        // Three.js converts its 0.1 linear background to display space. This is
        // the equivalent visible gray in BroMetal's direct canvas output.
        clearColor: [0.35, 0.35, 0.35, 1],
        cull: 'back',
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }

      const target: [number, number, number] = [0, -1.5, 0];
      const orbit = {
        azimuth: 0,
        polar: Math.atan2(50, 16.5),
        distance: Math.hypot(50, 16.5),
      };
      let drag: { pointerId: number; button: number; x: number; y: number } | null = null;

      canvas.style.touchAction = 'none';
      canvas.style.cursor = 'grab';
      const onPointerDown = (event: PointerEvent) => {
        drag = { pointerId: event.pointerId, button: event.button, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = 'grabbing';
      };
      const onPointerMove = (event: PointerEvent) => {
        if (drag === null || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        if (drag.button === 0) {
          orbit.azimuth -= dx * 0.005;
          orbit.polar = Math.max(0.05, Math.min(Math.PI / 2, orbit.polar - dy * 0.005));
        } else {
          const panScale = orbit.distance * 0.0015;
          target[0] -= (Math.cos(orbit.azimuth) * dx + Math.sin(orbit.azimuth) * dy) * panScale;
          target[1] += dy * panScale;
          target[2] += (-Math.sin(orbit.azimuth) * dx + Math.cos(orbit.azimuth) * dy) * panScale;
        }
      };
      const onPointerUp = (event: PointerEvent) => {
        if (drag?.pointerId !== event.pointerId) return;
        drag = null;
        canvas.releasePointerCapture(event.pointerId);
        canvas.style.cursor = 'grab';
      };
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        orbit.distance = Math.max(2, Math.min(1000, orbit.distance * Math.exp(event.deltaY * 0.001)));
      };
      const onContextMenu = (event: MouseEvent) => event.preventDefault();
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('contextmenu', onContextMenu);

      // The reference's billion-triangle figure is source capacity: every
      // instance multiplied by the highest-detail asset. Keep that asset in the
      // example, then submit cheaper geometry for distant rows.
      const sourceGeometry = createTeapot({ size: 1, segments: 10 });
      const sourceTriangles = sourceGeometry.indices.length / 3 * SOURCE_INSTANCE_COUNT;
      const levels = [
        { geometry: expandClusters(sourceGeometry) },
        { geometry: expandClusters(createTeapot({ size: 1, segments: 5 })) },
        { geometry: expandClusters(createTeapot({ size: 1, segments: 2 })) },
      ];

      const visibleBuffers = levels.map(() =>
        createStorageBuffer(renderer, new Float32Array(SOURCE_INSTANCE_COUNT)),
      );
      const indirectBuffers = levels.map(({ geometry }) =>
        createStorageBuffer(renderer, new Uint32Array([geometry.positions.length / 3, 0, 0, 0])),
      );
      const programs = levels.map(({ geometry }, index) => {
        const program = createProgram(renderer, clusterShader);
        program.attributes.aPosition.set(geometry.positions);
        program.attributes.aClusterColor.set(geometry.colours);
        program.uniforms.uVisible.set(visibleBuffers[index]!);
        return program;
      });

      const cullProgram = createProgram(renderer, cullShader);
      cullProgram.uniforms.uHighVisible.set(visibleBuffers[0]!);
      cullProgram.uniforms.uMidVisible.set(visibleBuffers[1]!);
      cullProgram.uniforms.uLowVisible.set(visibleBuffers[2]!);
      cullProgram.uniforms.uHighArgs.set(indirectBuffers[0]!);
      cullProgram.uniforms.uMidArgs.set(indirectBuffers[1]!);
      cullProgram.uniforms.uLowArgs.set(indirectBuffers[2]!);

      const projection = mat4.scratch();
      const view = mat4.scratch();
      const viewProjection = mat4.scratch();
      let eye: [number, number, number] = [0, 15, 50];

      const updateCamera = () => {
        const horizontal = Math.sin(orbit.polar) * orbit.distance;
        eye = [
          target[0] + Math.sin(orbit.azimuth) * horizontal,
          target[1] + Math.cos(orbit.polar) * orbit.distance,
          target[2] + Math.cos(orbit.azimuth) * horizontal,
        ];
        mat4.perspective(50 * Math.PI / 180, renderer.aspect, 0.25, 1_000_000, projection);
        mat4.lookAt(eye, target, [0, 1, 0], view);
        mat4.multiply(projection, view, viewProjection);
      };

      const stop = renderer.loop((time) => {
        tick(time);
        for (let index = 0; index < programs.length; index++) {
          const program = programs[index]!;
          program.uniforms.uViewProj.set(viewProjection);
          program.uniforms.uTime.set(time);
          program.drawIndirect(indirectBuffers[index]!);
        }
      }, () => {
        updateCamera();
        for (let index = 0; index < levels.length; index++) {
          indirectBuffers[index]!.write(new Uint32Array([levels[index]!.geometry.positions.length / 3, 0, 0, 0]));
        }
        cullProgram.uniforms.uViewProj.set(viewProjection);
        cullProgram.uniforms.uCamera.set(eye);
        cullProgram.dispatch(SOURCE_INSTANCE_COUNT / 64);
      });

      cleanup = () => {
        stop();
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('contextmenu', onContextMenu);
        for (const program of programs) program.dispose();
        cullProgram.dispose();
        for (const buffer of visibleBuffers) buffer.dispose();
        for (const buffer of indirectBuffers) buffer.dispose();
        renderer.destroy();
      };

      canvas.dataset.instances = SOURCE_INSTANCE_COUNT.toLocaleString();
      canvas.dataset.sourceTriangles = sourceTriangles.toLocaleString();
    })().catch(report);

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [report, tick]);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <aside className="showcase-caption panel">
        <p className="showcase-kicker">GPU-driven visibility</p>
        <h1>Nanite-Style Teapots</h1>
        <p>
          A 400 × 400 Utah teapot field uses compute culling, GPU-built visibility queues, and indirect LOD draws.{' '}
          Adapted from sunag&apos;s{' '}
          <a href="https://raw.githack.com/sunag/three.js/dev-nanite-style/examples/webgpu_compute_nanite-style.html" target="_blank" rel="noreferrer">
            Three.js GPU-Driven Nanite-style Rasterizer
          </a>.
        </p>
        <div className="showcase-tags">
          <span>1.01B source triangles</span><span>160,000 teapots</span><span>3 draw calls</span>
        </div>
        <small>Only visible teapots reach the render passes; LOD selection runs entirely on the GPU.</small>
      </aside>
      <DemoStats stats={stats}>1.01B source · GPU culling · indirect LOD</DemoStats>
      <ErrorToast error={error} onDismiss={dismiss} />
    </>
  );
}
