import type { Metadata } from 'next';
import TerrainDemo from '@/demos/TerrainDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Terrain' };

export default function TerrainPage() {
  return (
    <>
      <ExampleNav current="terrain" />
      <TerrainDemo />
    </>
  );
}
