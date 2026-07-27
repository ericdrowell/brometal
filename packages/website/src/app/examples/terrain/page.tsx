import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import TerrainDemo from '@/demos/TerrainDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('terrain');

export default function TerrainPage() {
  return (
    <>
      <ExampleNav current="terrain" />
      <TerrainDemo />
    </>
  );
}
