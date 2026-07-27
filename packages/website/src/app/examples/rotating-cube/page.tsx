import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import RotatingCubeDemo from '@/demos/RotatingCubeDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('rotating-cube');

export default function RotatingCubePage() {
  return (
    <>
      <ExampleNav current="rotating-cube" />
      <RotatingCubeDemo />
    </>
  );
}
