import Link from 'next/link';

const EXAMPLES = [
  {
    slug: 'rotating-cube',
    name: 'Rotating Cube',
    description: 'Hello world: one spinning cube, a TypeScript shader, and the WebGL2 runtime.',
  },
  {
    slug: 'instanced-cubes',
    name: 'Instanced Cubes',
    description: '125,000 independently tumbling cubes in a single draw call — rotation computed on the GPU.',
  },
  {
    slug: 'camera',
    name: 'Camera',
    description: 'Interactive camera: position and rotation sliders driving a cached view-projection matrix.',
  },
  {
    slug: 'textures-with-light',
    name: 'Textures with Light',
    description: 'Blinn-Phong lit cube with a movable point light and nine CC0 textures to choose from.',
  },
];

export default function ExamplesPage() {
  return (
    <main className="page">
      <h1>Examples</h1>
      <ul className="example-list">
        {EXAMPLES.map((example) => (
          <li key={example.slug}>
            <Link href={`/examples/${example.slug}`}>
              <div className="name">{example.name}</div>
              <div className="desc">{example.description}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
