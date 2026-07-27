import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import ModelDemo from '@/demos/ModelDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('model');

export default function ModelPage() {
  return (
    <>
      <ExampleNav current="model" />
      <ModelDemo />
    </>
  );
}
