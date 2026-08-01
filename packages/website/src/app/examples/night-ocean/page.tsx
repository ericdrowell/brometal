import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import NightOceanDemo from '@/demos/NightOceanDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('night-ocean');

export default function NightOceanPage() {
  return (
    <>
      <ExampleNav current="night-ocean" />
      <NightOceanDemo />
    </>
  );
}
