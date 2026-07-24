import type { Metadata } from 'next';
import ShaderLibraryDemo from '@/demos/ShaderLibraryDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Shader Library' };

export default function ShaderLibraryPage() {
  return (
    <>
      <ExampleNav current="shader-library" />
      <ShaderLibraryDemo />
    </>
  );
}
