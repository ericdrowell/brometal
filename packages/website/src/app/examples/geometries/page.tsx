import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import GeometriesDemo from '@/demos/GeometriesDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('geometries');

export default function GeometriesPage() {
  return (
    <>
      <ExampleNav current="geometries" />
      <GeometriesDemo />
    </>
  );
}
