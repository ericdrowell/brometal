'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createProgram,
  createRenderer,
  createTexture,
  loadGlb,
  mat4,
  type RendererBackend,
} from 'brometal';
import BackendBadge from '@/components/BackendBadge';
import modelShader from '@/shaders/model.shader.gen';

export default function ModelDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const [renderer, model] = await Promise.all([
        createRenderer(canvas, { clearColor: [0.06, 0.06, 0.1, 1], cull: 'back' }),
        loadGlb('/models/spitfire.glb'),
      ]);
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const mesh = model.meshes[0]!;
      const program = createProgram(renderer, modelShader);
      program.attributes.aPosition.set(mesh.positions);
      program.attributes.aNormal.set(mesh.normals!);
      program.attributes.aUv.set(mesh.uvs!);
      program.setIndices(mesh.indices!);

      // The glb embeds its painted texture; glTF UVs start at the top-left,
      // so upload without the default bottom-left flip.
      const image = model.images[mesh.imageIndex!]!;
      const bitmap = await createImageBitmap(new Blob([image.data.slice() as unknown as BlobPart], { type: image.mimeType }));
      const texture = createTexture(renderer, bitmap, { flipY: false });
      program.uniforms.uTex.set(texture);
      program.uniforms.uLightDir.set([0.5, 0.8, 0.35]);

      const cameraPos: [number, number, number] = [0, 4.5, 12];
      program.uniforms.uViewPos.set(cameraPos);
      const camera = createCamera({ position: cameraPos });
      camera.lookAt(0, 0, 0);

      const stop = renderer.loop((t) => {
        const model = mat4.multiply(
          mat4.rotationY(t * 0.45),
          mat4.translation(0, Math.sin(t * 0.8) * 0.25, 0),
        );
        program.uniforms.uViewProj.set(camera.viewProjection(renderer.aspect));
        program.uniforms.uModel.set(model);
        program.draw();
      });

      cleanup = () => {
        stop();
        texture.dispose();
        program.dispose();
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
          <h1>Model</h1>
          <p className="panel-note">
            A textured .glb loaded with <code>loadGlb</code> — parsed straight into attribute
            arrays and a <code>createTexture</code> upload. Spitfire by Quaternius (CC0).
          </p>
        </div>
      </div>
      <BackendBadge backend={backend} />
    </>
  );
}
