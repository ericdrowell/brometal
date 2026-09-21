import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ExampleNav from '@/components/ExampleNav';
import ShaderExampleDemo from '@/demos/ShaderExampleDemo';
import ShowcaseDemo from '@/demos/ShowcaseDemo';
import ToonDemo from '@/demos/ToonDemo';
import { SHADER_LIBRARY_EXAMPLES, SHOWCASE_EXAMPLES } from '@/lib/examples';
import { pageMetadata } from '@/lib/seo';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return [...SHOWCASE_EXAMPLES, ...SHADER_LIBRARY_EXAMPLES].map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const example = [...SHOWCASE_EXAMPLES, ...SHADER_LIBRARY_EXAMPLES]
    .find((entry) => entry.slug === slug);
  if (example === undefined) return {};
  return pageMetadata({
    title: example.name,
    description: example.description,
    path: `/examples/${slug}`,
  });
}

export default async function GeneratedExamplePage({ params }: Props) {
  const { slug } = await params;
  const showcase = SHOWCASE_EXAMPLES.find((entry) => entry.slug === slug);
  const shaderExample = SHADER_LIBRARY_EXAMPLES.find((entry) => entry.slug === slug);
  const example = showcase ?? shaderExample;
  if (example === undefined) notFound();
  return (
    <>
      <ExampleNav current={slug} />
      {showcase !== undefined
        ? <ShowcaseDemo example={showcase} />
        : shaderExample?.shaderKey === 'toon'
          ? <ToonDemo />
          : <ShaderExampleDemo example={shaderExample!} />}
    </>
  );
}
