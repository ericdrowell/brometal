import Link from 'next/link';
import { EXAMPLE_SECTIONS } from '@/lib/examples';

export default function ExamplesPage() {
  return (
    <main className="page">
      <h1>Examples</h1>
      {EXAMPLE_SECTIONS.map((section) => (
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
