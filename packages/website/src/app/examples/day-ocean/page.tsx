import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import DayOceanDemo from '@/demos/DayOceanDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('day-ocean');

export default function DayOceanPage() {
  return (
    <>
      <ExampleNav current="day-ocean" />
      <DayOceanDemo />
    </>
  );
}
