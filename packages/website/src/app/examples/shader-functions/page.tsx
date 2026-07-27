import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import ShaderFunctionsDemo from '@/demos/ShaderFunctionsDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('shader-functions');

export default function ShaderFunctionsPage() {
  return (
    <>
      <ExampleNav current="shader-functions" />
      <ShaderFunctionsDemo />
    </>
  );
}
