'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createPlane,
  createProgram,
  createRenderer,
  loadTexture,
  type BroMetalProgram,
  type CompiledShader,
  type GpuRecord,
  type RendererBackend,
} from 'brometal';
import BackendBadge from '@/components/BackendBadge';

import {
  valueNoiseShader,
  fbmShader,
  voronoiShader,
  paletteShader,
  hsvShader,
  sdfShader,
  easingShader,
  lightingShader,
  tonemapShader,
  checkerShader,
  ringsShader,
  kaleidoscopeShader,
  tunnelShader,
  metaballsShader,
  starfieldShader,
  fireShader,
  causticsShader,
  electricShader,
  juliaShader,
  raymarchShader,
  pixelateShader,
  crtShader,
  chromaticShader,
  halftoneShader,
  edgesShader,
  glitchShader,
  sepiaShader,
  warpShader,
  worleyEdgesShader,
  toonShader,
} from 'brometal/shaders';

const IMAGE_TEXTURE = 'bricks104';

interface Entry {
  key: string;
  title: string;
  uses: string;
  needsTexture?: boolean;
  shader: CompiledShader<GpuRecord, GpuRecord, GpuRecord>;
}

interface Group {
  title: string;
  entries: Entry[];
}

const GROUPS: Group[] = [
  {
    title: 'Fundamentals',
    entries: [
      { key: 'value-noise', title: 'Value Noise', uses: 'vnoise2', shader: valueNoiseShader },
      { key: 'fbm', title: 'FBM Clouds', uses: 'fbm2', shader: fbmShader },
      { key: 'voronoi', title: 'Voronoi', uses: 'voronoi2 · hash22', shader: voronoiShader },
      { key: 'palette', title: 'Cosine Palette', uses: 'cosinePalette', shader: paletteShader },
      { key: 'hsv', title: 'HSV Wheel', uses: 'hsv2rgb · sdCircle · fillAA', shader: hsvShader },
      { key: 'sdf', title: 'SDF Shapes', uses: 'sdCircle · sdBox2 · smoothUnion · fillAA', shader: sdfShader },
      { key: 'easing', title: 'Easing Race', uses: 'easeOutBounce · easeOutElastic · easeInOutCubic', shader: easingShader },
      { key: 'lighting', title: 'Lighting', uses: 'lambert · blinnPhongSpec · fresnel · hemisphereLight', shader: lightingShader },
      { key: 'toon', title: 'Toon Shading', uses: 'toonShade · specGGX', shader: toonShader },
      { key: 'tonemap', title: 'ACES Tonemap', uses: 'tonemapACES · gammaCorrect · fbm2', shader: tonemapShader },
    ],
  },
  {
    title: 'Patterns',
    entries: [
      { key: 'checker', title: 'Checkerboard', uses: 'rotate2', shader: checkerShader },
      { key: 'rings', title: 'Rings', uses: 'fbm2 · cosinePalette', shader: ringsShader },
      { key: 'kaleidoscope', title: 'Kaleidoscope', uses: 'fbm2 · cosinePalette', shader: kaleidoscopeShader },
      { key: 'worley-edges', title: 'Worley Edges', uses: 'worleyEdge2', shader: worleyEdgesShader },
      { key: 'tunnel', title: 'Tunnel', uses: 'rotate2', shader: tunnelShader },
    ],
  },
  {
    title: 'Animated',
    entries: [
      { key: 'metaballs', title: 'Metaballs', uses: 'cosinePalette', shader: metaballsShader },
      { key: 'starfield', title: 'Starfield', uses: 'hash22 · hash21', shader: starfieldShader },
      { key: 'fire', title: 'Fire', uses: 'fbm2', shader: fireShader },
      { key: 'caustics', title: 'Caustics', uses: 'voronoi2', shader: causticsShader },
      { key: 'warp', title: 'Domain Warp', uses: 'warp2 · cosinePalette', shader: warpShader },
      { key: 'electric', title: 'Lightning', uses: 'fbm2 · hash11', shader: electricShader },
    ],
  },
  {
    title: 'Fractals & 3D',
    entries: [
      { key: 'julia', title: 'Julia Set', uses: 'cosinePalette', shader: juliaShader },
      { key: 'raymarch', title: 'Raymarched Scene', uses: 'sdSphere3 · sdBox3 · sdTorus3 · smoothUnion · lambert · fresnel', shader: raymarchShader },
    ],
  },
  {
    title: 'Image Effects',
    entries: [
      { key: 'pixelate', title: 'Pixelate', uses: 'texture()', needsTexture: true, shader: pixelateShader },
      { key: 'crt', title: 'CRT', uses: 'texture()', needsTexture: true, shader: crtShader },
      { key: 'chromatic', title: 'Chromatic Aberration', uses: 'texture()', needsTexture: true, shader: chromaticShader },
      { key: 'halftone', title: 'Halftone', uses: 'luminance · rotate2 · fillAA', needsTexture: true, shader: halftoneShader },
      { key: 'edges', title: 'Edge Detect', uses: 'luminance', needsTexture: true, shader: edgesShader },
      { key: 'glitch', title: 'Glitch', uses: 'hash11', needsTexture: true, shader: glitchShader },
      { key: 'sepia', title: 'Sepia + Vignette', uses: 'luminance', needsTexture: true, shader: sepiaShader },
    ],
  },
];

const ALL_ENTRIES = GROUPS.flatMap((group) => group.entries);

type QuadProgram = BroMetalProgram<
  { aPosition: 'vec3'; aUv: 'vec2' },
  GpuRecord,
  { uTime: 'float'; uAspect: 'float' }
>;

export default function ShaderLibraryDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const activeRef = useRef(ALL_ENTRIES[0]!.key);
  const [selected, setSelected] = useState(ALL_ENTRIES[0]!.key);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const renderer = await createRenderer(canvas, { clearColor: [0.07, 0.07, 0.1, 1] });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const quad = createPlane({ width: 2, height: 2 });
      const programs = new Map<string, QuadProgram>();
      const texture = await loadTexture(renderer, `/textures/${IMAGE_TEXTURE}.jpg`);
      if (cancelled) {
        texture.dispose();
        renderer.destroy();
        return;
      }

      for (const entry of ALL_ENTRIES) {
        const program = createProgram(renderer, entry.shader) as unknown as QuadProgram;
        program.attributes.aPosition.set(quad.positions);
        program.attributes.aUv.set(quad.uvs);
        program.setIndices(quad.indices);
        if (entry.needsTexture === true) {
          (program.uniforms as Record<string, { set(value: unknown): void }>).uTex!.set(texture);
        }
        programs.set(entry.key, program);
      }

      const stop = renderer.loop((t) => {
        const program = programs.get(activeRef.current);
        if (program === undefined) return;
        program.uniforms.uTime.set(t);
        program.uniforms.uAspect.set(renderer.aspect);
        program.draw();
      });

      cleanup = () => {
        stop();
        for (const program of programs.values()) {
          program.dispose();
        }
        programs.clear();
        texture.dispose();
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const onSelect = (key: string): void => {
    activeRef.current = key;
    setSelected(key);
  };

  const selectedEntry = ALL_ENTRIES.find((entry) => entry.key === selected);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>Shader Library</h1>
          <p className="panel-note">
            {ALL_ENTRIES.length} effects shipped prebuilt in <code>brometal/shaders</code> —
            compiled at package build time, zero compilation in your app.
          </p>
          <select
            className="effect-select"
            value={selected}
            onChange={(event) => onSelect(event.target.value)}
          >
            {GROUPS.map((group) => (
              <optgroup key={group.title} label={group.title}>
                {group.entries.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="panel-note uses-note">{selectedEntry?.uses}</p>
        </div>
      </div>
      <BackendBadge backend={backend} />
    </>
  );
}
