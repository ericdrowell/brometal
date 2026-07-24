import type { Metadata } from 'next';
import RotatingCubeDemo from '@/demos/RotatingCubeDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Rotating Cube' };

export default function RotatingCubePage() {
  return (
    <>
      <ExampleNav current="rotating-cube" />
      <RotatingCubeDemo />
    </>
  );
}
