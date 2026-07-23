import type { RendererBackend } from 'brometal';

const LABELS: Record<RendererBackend, string> = {
  webgpu: 'WebGPU',
  webgl2: 'WebGL2',
};

/** Shows which rendering backend the demo's renderer actually selected. */
export default function BackendBadge({ backend }: { backend: RendererBackend | null }) {
  if (backend === null) {
    return null;
  }
  return (
    <div className={`backend-badge ${backend}`} title="Rendering backend selected at runtime">
      {LABELS[backend]}
    </div>
  );
}
