import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import TexturesDemo from '@/demos/TexturesDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('textures');

export default function TexturesPage() {
  return (
    <>
      <ExampleNav current="textures" />
      <TexturesDemo />
    </>
  );
}
