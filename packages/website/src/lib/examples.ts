export interface ExampleEntry {
  slug: string;
  name: string;
  description: string;
  /** Searchable technique labels used by the gallery, not marketing copy. */
  tags?: string[];
  /** Featured cards are the editorial front door to the catalogue. */
  featured?: boolean;
  /** CSS colours for the lightweight catalogue preview. */
  palette?: readonly [string, string, string];
  /** Shared procedural showcase preset. Omitted by the hand-built examples. */
  preset?: number;
  /** Prebuilt shader export rendered by the shared shader-example page. */
  shaderKey?: string;
  uses?: string;
  needsTexture?: boolean;
  sourcePath?: string;
}

export interface ExampleSection {
  title: string;
  examples: ExampleEntry[];
}

const REPOSITORY = 'https://github.com/ericdrowell/brometal';

/** Canonical source URL for both hand-built demos and shared shader studies. */
export function exampleSourceUrl(example: ExampleEntry): string {
  if (example.sourcePath !== undefined) return `${REPOSITORY}/blob/main/${example.sourcePath}`;
  const name = example.slug
    .split('-')
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join('');
  return `${REPOSITORY}/blob/main/packages/website/src/demos/${name}Demo.tsx`;
}

type ShowcaseSeed = readonly [
  slug: string,
  name: string,
  description: string,
  tags: string[],
  palette: readonly [string, string, string],
];

function showcaseSection(title: string, seeds: ShowcaseSeed[], offset: number): ExampleSection {
  return {
    title,
    examples: seeds.map(([slug, name, description, tags, palette], index) => ({
      slug,
      name,
      description,
      tags,
      palette,
      preset: offset + index,
      featured: index === 0,
      sourcePath: 'packages/website/src/shaders/showcase.shader.ts',
    })),
  };
}

/**
 * Ten deliberately different examples backed by one composable shader laboratory.
 * Each entry owns a distinct rendering technique; palettes are presentation,
 * never an excuse to count the same effect twice.
 */
export const SHOWCASE_SECTIONS: ExampleSection[] = [
  showcaseSection('Cosmos', [
    ['event-horizon', 'Event Horizon', 'A lensing black-hole silhouette wrapped in a white-hot, Doppler-shifted accretion ring.', ['space', 'lensing', 'procedural'], ['#03040a', '#ff5a36', '#ffd88a']],
  ], 0),
  showcaseSection('Fluid & Fire', [
    ['solar-flare', 'Solar Flare', 'Magnetic ribbons peel away from a turbulent star in incandescent loops.', ['fire', 'noise', 'plasma'], ['#120202', '#ff3b0a', '#fff09a']],
  ], 1),
  showcaseSection('Geometric', [
    ['crystal-cathedral', 'Crystal Cathedral', 'Prismatic vaults repeat into an impossible mirrored sanctuary.', ['geometry', 'kaleidoscope', 'crystal'], ['#030a12', '#35c2ff', '#edc7ff']],
  ], 2),
  showcaseSection('Organic', [
    ['bioluminescent-reef', 'Bioluminescent Reef', 'Living cyan cells pulse and communicate across a midnight reef.', ['organic', 'voronoi', 'glow'], ['#01090d', '#00a98f', '#a9fff1']],
  ], 3),
  showcaseSection('Dream Worlds', [
    ['synthwave-horizon', 'Synthwave Horizon', 'A laser sun sinks behind a racing perspective grid and chrome mountains.', ['world', 'retro', 'grid'], ['#07031d', '#ff2fb3', '#45dfff']],
  ], 4),
  showcaseSection('Energy', [
    ['lightning-oracle', 'Lightning Oracle', 'Forking electric paths repeatedly discover a radiant central sigil.', ['energy', 'lightning', 'procedural'], ['#050412', '#755cff', '#ffffff']],
  ], 5),
  showcaseSection('Fractals', [
    ['julia-jewel', 'Julia Jewel', 'A polished complex-plane jewel refracts a continuously evolving boundary.', ['fractal', 'julia', 'iridescence'], ['#05040d', '#2f64ff', '#ff65d8']],
  ], 6),
  showcaseSection('Retro Future', [
    ['arcade-warp', 'Arcade Warp', 'A saturated star tunnel accelerates toward an impossible arcade horizon.', ['retro', 'tunnel', 'stars'], ['#03030b', '#ff2daa', '#38f5ff']],
  ], 7),
  showcaseSection('Light Studies', [
    ['stained-light', 'Stained Light', 'Jewel-toned panes throw animated pools of colour through smoky air.', ['light', 'glass', 'caustics'], ['#06050a', '#ef426f', '#6df7e8']],
  ], 8),
  showcaseSection('Digital Artifacts', [
    ['data-waterfall', 'Data Waterfall', 'Dense luminous symbols pour down a curved digital surface.', ['digital', 'data', 'rain'], ['#010704', '#00c96b', '#beffcf']],
  ], 9),
];

function shaderLibraryExample(
  key: string,
  name: string,
  uses: string,
  needsTexture = false,
): ExampleEntry {
  return {
    slug: `shader-${key}`,
    name,
    description: `A prebuilt ${name} study using ${uses}, ready to import from brometal/shaders.`,
    tags: ['prebuilt shader', ...uses.split(' · ')],
    shaderKey: key,
    uses,
    needsTexture,
    sourcePath: `packages/brometal/src/shaders/${key}.shader.ts`,
  };
}

export const SHADER_LIBRARY_EXAMPLES: ExampleEntry[] = [
  shaderLibraryExample('value-noise', 'Value Noise', 'vnoise2'),
  shaderLibraryExample('fbm', 'FBM Clouds', 'fbm2'),
  shaderLibraryExample('voronoi', 'Voronoi', 'voronoi2 · hash22'),
  shaderLibraryExample('palette', 'Cosine Palette', 'cosinePalette'),
  shaderLibraryExample('sdf', 'SDF Shapes', 'sdCircle · sdBox2 · smoothUnion · fillAA'),
  shaderLibraryExample('lighting', 'Lighting', 'lambert · blinnPhongSpec · fresnel · hemisphereLight'),
  {
    ...shaderLibraryExample('toon', 'Toon Shading', 'toonShade · specGGX'),
    description:
      'A neon torus knot and orbiting moons rendered with stepped light, graphic highlights, silhouette ink, and shadow hatching.',
    sourcePath: 'packages/website/src/shaders/toon-showcase.shader.ts',
  },
  shaderLibraryExample('checker', 'Checkerboard', 'rotate2'),
  shaderLibraryExample('rings', 'Rings', 'fbm2 · cosinePalette'),
  shaderLibraryExample('kaleidoscope', 'Kaleidoscope', 'fbm2 · cosinePalette'),
  shaderLibraryExample('worley-edges', 'Worley Edges', 'worleyEdge2'),
  shaderLibraryExample('tunnel', 'Tunnel', 'rotate2'),
  shaderLibraryExample('metaballs', 'Metaballs', 'cosinePalette'),
  shaderLibraryExample('starfield', 'Starfield', 'hash22 · hash21'),
  shaderLibraryExample('fire', 'Fire', 'fbm2'),
  shaderLibraryExample('caustics', 'Caustics', 'voronoi2'),
  shaderLibraryExample('warp', 'Domain Warp', 'warp2 · cosinePalette'),
  shaderLibraryExample('electric', 'Lightning', 'fbm2 · hash11'),
  shaderLibraryExample('julia', 'Julia Set', 'cosinePalette'),
  shaderLibraryExample('raymarch', 'Raymarching', 'sdSphere3 · sdBox3 · sdTorus3 · smoothUnion · lambert · fresnel'),
  shaderLibraryExample('crt', 'CRT', 'texture()', true),
  shaderLibraryExample('chromatic', 'Chromatic Aberration', 'texture()', true),
  shaderLibraryExample('halftone', 'Halftone', 'luminance · rotate2 · fillAA', true),
  shaderLibraryExample('edges', 'Edge Detect', 'luminance', true),
  shaderLibraryExample('glitch', 'Glitch', 'hash11', true),
  shaderLibraryExample('sepia', 'Sepia + Vignette', 'luminance', true),
];

const SHADER_LIBRARY_SECTION: ExampleSection = {
  title: 'Shader Library',
  examples: SHADER_LIBRARY_EXAMPLES,
};

export const EXAMPLE_SECTIONS: ExampleSection[] = [
  {
    title: 'Basics',
    examples: [
      {
        slug: 'rotating-cube',
        name: 'Rotating Cube',
        description: 'Hello world: one spinning cube, a TypeScript shader, and the WebGPU runtime.',
      },
      {
        slug: 'lots-of-cubes',
        name: 'Quantum Halo',
        description:
          '120,000 independently lit cuboids form a rippling kinetic sculpture in one draw call.',
        tags: ['instancing', 'geometry', 'performance'],
        palette: ['#03030b', '#5755ff', '#ff65d8'],
      },
      {
        slug: 'camera',
        name: 'Camera',
        description:
          'Interactive camera: position and rotation sliders driving a cached view-projection matrix.',
      },
      {
        slug: 'light',
        name: 'Light',
        description: 'Blinn-Phong lighting on solid-colored faces with a movable point light.',
      },
      {
        slug: 'textures',
        name: 'Texture',
        description: 'A lit, textured cube — move the light and pick from nine CC0 textures.',
      },
      {
        slug: 'geometries',
        name: 'Geometry',
        description:
          'Every built-in geometry — cube, sphere, torus knot, and friends — with a live selector.',
      },
      {
        slug: 'shadow',
        name: 'Shadow',
        description:
          'Shadow mapping in two passes — geometry rendered from the light into a depth-tested render target, then sampled back with 9-tap PCF.',
      },
      {
        slug: 'blend',
        name: 'Blend',
        description:
          'One shader, three blend modes — opaque, alpha transparency, and additive glow, switched with a program option.',
      },
      {
        slug: 'model',
        name: 'Model',
        description:
          'A textured spaceship loaded from a .glb file with loadGlb — CC0 model by Quaternius.',
      },
    ],
  },
  {
    title: 'Shaders',
    examples: [
      {
        slug: 'shader-functions',
        name: 'Shader Functions',
        description:
          'A visual reference example for every function in brometal/shader-functions — noise, easing, color, lighting, SDFs.',
      },
      {
        slug: 'custom-shader',
        name: 'Custom Shader',
        description:
          'Procedural plasma written in plain TypeScript — helper functions, let, and for loops compiled to WGSL.',
      },
    ],
  },
  SHADER_LIBRARY_SECTION,
  {
    title: 'Advanced',
    examples: [
      {
        slug: 'terrain',
        name: 'Terrain',
        description:
          'A 65k-vertex plane sculpted into rolling terrain by fbm noise running in the vertex shader.',
      },
      {
        slug: 'ripples',
        name: 'Ripples',
        description:
          'Elastic ripples rolling across a surface — easing functions driving per-vertex animation on the GPU.',
      },
      {
        slug: 'night-ocean',
        name: 'Night Ocean',
        description:
          'A moonlit ocean — Gerstner waves in the vertex shader, fbm micro-ripples, fresnel, and a specular glint per pixel.',
      },
      {
        slug: 'day-ocean',
        name: 'Day Ocean',
        description:
          'Eight Gerstner waves shape tropical water with analytic normals, refracted caustics, depth-aware colour, and steepness-driven foam.',
      },
    ],
  },
  {
    title: 'Games',
    examples: [
      {
        slug: 'brocraft',
        name: 'Brocraft',
        description:
          'A blocky voxel world you can fly through — the terrain, every block material, and all the culling are computed in the vertex shader.',
      },
      {
        slug: 'star-bro',
        name: 'Star Bro',
        description:
          'A playable flight experience — fly the Spitfire through an instanced asteroid field with an additive engine trail and a follow camera.',
      },
      {
        slug: 'legend-of-bro',
        name: 'Legend of Bro',
        description:
          'A top-down overworld you can walk around — a tilemap and every animated sprite drawn from one atlas in two instanced draw calls.',
      },
    ],
  },
  ...SHOWCASE_SECTIONS,
];

/** Alphabetical list shared by direct-page previous/next navigation. */
export const EXAMPLES: ExampleEntry[] = EXAMPLE_SECTIONS
  .flatMap((section) => section.examples)
  .sort((a, b) => a.name.localeCompare(b.name));

export const SHOWCASE_EXAMPLES: ExampleEntry[] = SHOWCASE_SECTIONS.flatMap(
  (section) => section.examples,
);
