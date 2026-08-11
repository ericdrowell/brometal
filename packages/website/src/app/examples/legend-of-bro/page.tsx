import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import LegendOfBroDemo from '@/demos/LegendOfBroDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('legend-of-bro');

export default function LegendOfBroPage() {
  return (
    <>
      <ExampleNav current="legend-of-bro" />
      <LegendOfBroDemo />
    </>
  );
}
