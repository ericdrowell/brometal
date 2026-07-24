import type { Metadata } from 'next';
import LotsOfCubesDemo from '@/demos/LotsOfCubesDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Lots of Cubes' };

export default function LotsOfCubesPage() {
  return (
    <>
      <ExampleNav current="lots-of-cubes" />
      <LotsOfCubesDemo />
    </>
  );
}
