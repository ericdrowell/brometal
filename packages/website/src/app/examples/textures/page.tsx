import type { Metadata } from 'next';
import TexturesDemo from '@/demos/TexturesDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Texture' };

export default function TexturesPage() {
  return (
    <>
      <ExampleNav current="textures" />
      <TexturesDemo />
    </>
  );
}
