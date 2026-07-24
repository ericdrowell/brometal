import Link from 'next/link';

interface Example {
  slug: string;
  name: string;
  description: string;
}

const SECTIONS: { title: string; examples: Example[] }[] = [
  {
    title: 'Basic',
    examples: [
      {
        slug: 'rotating-cube',
        name: 'Rotating Cube',
        description: 'Hello world: one spinning cube, a TypeScript shader, and the WebGL2 runtime.',
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
        slug: 'blend',
        name: 'Blend',
        description:
          'One shader, three blend modes — opaque, alpha transparency, and additive glow, switched with a program option.',
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
          'Procedural plasma written in plain TypeScript — helper functions, let, and for loops compiled to GLSL.',
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
        slug: 'ocean',
        name: 'Ocean',
        description:
          'A moonlit ocean — Gerstner waves in the vertex shader, fbm micro-ripples, fresnel, and specular glint per pixel.',
      },
      // Temporarily hidden while the demo gets reworked.
      // {
      //   slug: 'starfighter',
      //   name: 'Starfighter',
      //   description:
      //     'A playable flight experience — steer through an instanced asteroid field with an additive engine trail and a follow camera.',
      // },
    ],
  },
];

export default function ExamplesPage() {
  return (
    <main className="page">
      <h1>Examples</h1>
      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 className="example-section-title">{section.title}</h2>
          <ul className="example-list">
            {section.examples.map((example) => (
              <li key={example.slug}>
                <Link href={`/examples/${example.slug}`}>
                  <div className="name">{example.name}</div>
                  <div className="desc">{example.description}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
