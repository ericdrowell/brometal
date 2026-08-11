export interface ExampleEntry {
  slug: string;
  name: string;
  description: string;
}

export interface ExampleSection {
  title: string;
  examples: ExampleEntry[];
}

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
        name: 'Lots of Cubes',
        description:
          '125,000 independently tumbling cubes in a single draw call — rotation computed on the GPU.',
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
          'Shadow mapping in two passes — the scene rendered from the light into a depth-tested render target, then sampled back with 9-tap PCF.',
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
        slug: 'shader-library',
        name: 'Shader Library',
        description:
          '30 prebuilt shaders shipped in brometal/shaders — fire, raymarching, fractals, image effects — zero compilation in your app.',
      },
      {
        slug: 'custom-shader',
        name: 'Custom Shader',
        description:
          'Procedural plasma written in plain TypeScript — helper functions, let, and for loops compiled to WGSL.',
      },
    ],
  },
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
          'Shallow tropical water in daylight — eight Gerstner waves with an exact analytic normal, a refracted seabed with per-channel absorption, caustics, and foam that keys off steepness rather than height.',
      },
      {
        slug: 'ball-physics',
        name: 'Ball Physics',
        description:
          'Balls colliding in a glass tank, simulated entirely on the GPU — state lives in a float render target and never touches the CPU.',
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
];

/** Flat, ordered list used for prev/next navigation. */
export const EXAMPLES: ExampleEntry[] = EXAMPLE_SECTIONS.flatMap((section) => section.examples);
