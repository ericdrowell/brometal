import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import OceanDemo from '@/demos/OceanDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('ocean');

export default function OceanPage() {
  return (
    <>
      <ExampleNav current="ocean" />
      <OceanDemo />
    </>
  );
}
