'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createProgram,
  createRenderer,
  createTexture,
  loadTexture,
  mat4,
  type BroMetalProgram,
  type BroMetalTexture,
} from 'brometal';
import litShader from '@/shaders/textured-cube.shader.gen';
import { indices, normals, positions, uvs } from '@/lib/cube-geometry';

const TEXTURES = [
  'wood095',
  'bricks104',
  'metal063',
  'tiles141',
  'marble012',
  'rock064',
  'grass005',
  'gravel043',
  'fabric081c',
];

type LitProgram = BroMetalProgram<
  (typeof litShader)['attributes'],
  (typeof litShader)['instanceAttributes'],
  (typeof litShader)['uniforms']
>;

export default function TexturesDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const programRef = useRef<LitProgram | null>(null);
  const textureCacheRef = useRef(new Map<string, Promise<BroMetalTexture>>());
  const selectedRef = useRef(TEXTURES[0]!);
  const lightRef = useRef(new Float32Array([4, 3, 6]));
  const [selected, setSelected] = useState(TEXTURES[0]!);
  const [light, setLight] = useState<[number, number, number]>([4, 3, 6]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const renderer = createRenderer(canvas, { clearColor: [0.07, 0.07, 0.1, 1], cull: 'back' });
    const { gl } = renderer;
    const program = createProgram(gl, litShader);
    programRef.current = program;

    program.attributes.aPosition.set(positions);
    program.attributes.aNormal.set(normals);
    program.attributes.aUv.set(uvs);
    program.setIndices(indices);

    const cameraPos: [number, number, number] = [0, 0, 6];
    const camera = createCamera({ position: cameraPos });
    program.uniforms.uViewPos.set(cameraPos);

    const placeholder = new ImageData(new Uint8ClampedArray([160, 160, 170, 255]), 1, 1);
    const placeholderTexture = createTexture(gl, placeholder);
    program.uniforms.uTex.set(placeholderTexture);
    selectTexture(gl, selectedRef.current);

    const model = mat4.scratch();
    const tilt = mat4.scratch();

    const stop = renderer.loop((t) => {
      const { drawingBufferWidth, drawingBufferHeight } = gl;
      const aspect = drawingBufferWidth / Math.max(drawingBufferHeight, 1);
      mat4.multiply(mat4.rotationY(t * 0.5, model), mat4.rotationX(t * 0.3, tilt), model);

      program.uniforms.uViewProj.set(camera.viewProjection(aspect));
      program.uniforms.uModel.set(model);
      program.uniforms.uLightPos.set(lightRef.current);
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

  function selectTexture(gl: WebGL2RenderingContext, name: string): void {
    const cache = textureCacheRef.current;
    let pending = cache.get(name);
    if (pending === undefined) {
      pending = loadTexture(gl, `/textures/${name}.jpg`);
      cache.set(name, pending);
    }
    pending.then(
      (loaded) => {
        if (selectedRef.current === name) {
          programRef.current?.uniforms.uTex.set(loaded);
        }
      },
      (error: unknown) => console.error(error),
    );
  }

  const onTileClick = (name: string): void => {
    selectedRef.current = name;
    setSelected(name);
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl2');
    if (gl != null) {
      selectTexture(gl, name);
    }
  };

  const onLightChange = (index: number, value: number): void => {
    const next: [number, number, number] = [...light];
    next[index] = value;
    setLight(next);
    lightRef.current[index] = value;
  };

  const axes = ['X', 'Y', 'Z'] as const;

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Light</h1>
          <h2>Position</h2>
          {axes.map((axis, index) => (
            <div className="row" key={axis}>
              <label htmlFor={`light-${axis}`}>{axis}</label>
              <input
                id={`light-${axis}`}
                type="range"
                min={-10}
                max={10}
                step={0.1}
                value={light[index]}
                onChange={(event) => onLightChange(index, Number(event.target.value))}
              />
              <output htmlFor={`light-${axis}`}>{light[index]!.toFixed(1)}</output>
            </div>
          ))}
        </div>
        <div className="panel">
          <h1>Texture</h1>
          <div className="tiles">
            {TEXTURES.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                data-texture={name}
                className={selected === name ? 'selected' : undefined}
                onClick={() => onTileClick(name)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/textures/${name}.jpg`} alt={name} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
