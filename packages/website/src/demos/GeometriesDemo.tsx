'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  createCamera,
  createCircle,
  createCone,
  createCube,
  createCylinder,
  createPlane,
  createProgram,
  createRenderer,
  createRing,
  createSphere,
  createTexture,
  createTorus,
  createTorusKnot,
  loadTexture,
  mat4,
  type BroMetalProgram,
  type Geometry,
} from 'brometal';
import litShader from '@/shaders/textured-cube.shader.gen';

const DEFAULT_TEXTURE = 'wood095';

interface GeometryEntry {
  key: string;
  title: string;
  create: () => Geometry;
}

const GEOMETRIES: GeometryEntry[] = [
  { key: 'cube', title: 'Cube', create: () => createCube() },
  { key: 'sphere', title: 'Sphere', create: () => createSphere({ radius: 1.3 }) },
  { key: 'plane', title: 'Plane', create: () => createPlane({ width: 2.6, height: 2.6 }) },
  { key: 'cylinder', title: 'Cylinder', create: () => createCylinder({ radiusTop: 0.9, radiusBottom: 0.9, height: 2.2 }) },
  { key: 'cone', title: 'Cone', create: () => createCone({ radius: 1.1, height: 2.2 }) },
  { key: 'torus', title: 'Torus', create: () => createTorus({ radius: 1, tube: 0.45 }) },
  { key: 'torus-knot', title: 'Torus Knot', create: () => createTorusKnot({ radius: 0.9, tube: 0.28 }) },
  { key: 'circle', title: 'Circle', create: () => createCircle({ radius: 1.3 }) },
  { key: 'ring', title: 'Ring', create: () => createRing({ innerRadius: 0.65, outerRadius: 1.3 }) },
];

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' as const };

const ICONS: Record<string, ReactNode> = {
  cube: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5Z" />
      <path d="M12 21.5V12m0 0 8.5-4.75M12 12 3.5 7.25" />
    </svg>
  ),
  sphere: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" />
      <ellipse cx="12" cy="12" rx="3.6" ry="9" />
    </svg>
  ),
  plane: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4.5 17.5 9.5 6.5h10l-5 11Z" />
    </svg>
  ),
  cylinder: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6v12M19 6v12M5 18a7 2.6 0 0 0 14 0" />
    </svg>
  ),
  cone: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3 5 17.5M12 3l7 14.5" />
      <ellipse cx="12" cy="17.5" rx="7" ry="2.6" />
    </svg>
  ),
  torus: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <ellipse cx="12" cy="12" rx="9" ry="5.4" />
      <ellipse cx="12" cy="11" rx="3.4" ry="1.6" />
    </svg>
  ),
  'torus-knot': (
    <svg viewBox="0 0 24 24" {...stroke}>
      <ellipse cx="12" cy="12" rx="8.5" ry="4.2" transform="rotate(28 12 12)" />
      <ellipse cx="12" cy="12" rx="8.5" ry="4.2" transform="rotate(-28 12 12)" />
    </svg>
  ),
  circle: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  ),
  ring: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
};

type LitProgram = BroMetalProgram<
  (typeof litShader)['attributes'],
  (typeof litShader)['instanceAttributes'],
  (typeof litShader)['uniforms']
>;

function applyGeometry(program: LitProgram, geometry: Geometry): void {
  program.attributes.aPosition.set(geometry.positions);
  program.attributes.aNormal.set(geometry.normals);
  program.attributes.aUv.set(geometry.uvs);
  program.setIndices(geometry.indices);
}

export default function GeometriesDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const programRef = useRef<LitProgram | null>(null);
  const geometryCacheRef = useRef(new Map<string, Geometry>());
  const [selected, setSelected] = useState(GEOMETRIES[0]!.key);

  const getGeometry = (key: string): Geometry => {
    const cache = geometryCacheRef.current;
    let geometry = cache.get(key);
    if (geometry === undefined) {
      geometry = GEOMETRIES.find((entry) => entry.key === key)!.create();
      cache.set(key, geometry);
    }
    return geometry;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    // No back-face culling: plane, circle, and ring are single-sided.
    const renderer = createRenderer(canvas, { clearColor: [0.07, 0.07, 0.1, 1] });
    const { gl } = renderer;
    const program = createProgram(gl, litShader);
    programRef.current = program;
    applyGeometry(program, getGeometry(GEOMETRIES[0]!.key));

    const cameraPos: [number, number, number] = [0, 0, 6];
    const camera = createCamera({ position: cameraPos });
    program.uniforms.uViewPos.set(cameraPos);
    program.uniforms.uLightPos.set([4, 3, 6]);

    const placeholder = new ImageData(new Uint8ClampedArray([160, 160, 170, 255]), 1, 1);
    const placeholderTexture = createTexture(gl, placeholder);
    program.uniforms.uTex.set(placeholderTexture);
    loadTexture(gl, `/textures/${DEFAULT_TEXTURE}.jpg`).then(
      (loaded) => programRef.current?.uniforms.uTex.set(loaded),
      (error: unknown) => console.error(error),
    );

    const model = mat4.scratch();
    const tilt = mat4.scratch();

    const stop = renderer.loop((t) => {
      const { drawingBufferWidth, drawingBufferHeight } = gl;
      const aspect = drawingBufferWidth / Math.max(drawingBufferHeight, 1);
      mat4.multiply(mat4.rotationY(t * 0.5, model), mat4.rotationX(t * 0.3, tilt), model);

      program.uniforms.uViewProj.set(camera.viewProjection(aspect));
      program.uniforms.uModel.set(model);
      program.draw();
    });

    return () => {
      stop();
      placeholderTexture.dispose();
      program.dispose();
      renderer.destroy();
      programRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelect = (key: string): void => {
    setSelected(key);
    const program = programRef.current;
    if (program !== null) {
      applyGeometry(program, getGeometry(key));
    }
  };

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Geometry</h1>
          <div className="geo-tiles">
            {GEOMETRIES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                data-geometry={entry.key}
                className={selected === entry.key ? 'selected' : undefined}
                onClick={() => onSelect(entry.key)}
              >
                {ICONS[entry.key]}
                <span>{entry.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
