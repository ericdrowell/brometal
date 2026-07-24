import type { Metadata } from 'next';
import OceanDemo from '@/demos/OceanDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Ocean' };

export default function OceanPage() {
  return (
    <>
      <ExampleNav current="ocean" />
      <OceanDemo />
    </>
  );
}
