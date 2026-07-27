import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import BallPhysicsDemo from '@/demos/BallPhysicsDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('ball-physics');

export default function BallPhysicsPage() {
  return (
    <>
      <ExampleNav current="ball-physics" />
      <BallPhysicsDemo />
    </>
  );
}
