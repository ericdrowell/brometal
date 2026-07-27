import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import ShaderLibraryDemo from '@/demos/ShaderLibraryDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('shader-library');

export default function ShaderLibraryPage() {
  return (
    <>
      <ExampleNav current="shader-library" />
      <ShaderLibraryDemo />
    </>
  );
}
