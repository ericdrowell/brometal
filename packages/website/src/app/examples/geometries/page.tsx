import type { Metadata } from 'next';
import GeometriesDemo from '@/demos/GeometriesDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Geometry' };

export default function GeometriesPage() {
  return (
    <>
      <ExampleNav current="geometries" />
      <GeometriesDemo />
    </>
  );
}
