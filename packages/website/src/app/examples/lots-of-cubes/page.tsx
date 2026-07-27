import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import LotsOfCubesDemo from '@/demos/LotsOfCubesDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('lots-of-cubes');

export default function LotsOfCubesPage() {
  return (
    <>
      <ExampleNav current="lots-of-cubes" />
      <LotsOfCubesDemo />
    </>
  );
}
