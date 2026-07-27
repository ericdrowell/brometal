import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import CustomShaderDemo from '@/demos/CustomShaderDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('custom-shader');

export default function CustomShaderPage() {
  return (
    <>
      <ExampleNav current="custom-shader" />
      <CustomShaderDemo />
    </>
  );
}
