import type { Metadata } from 'next';
import BallPhysicsDemo from '@/demos/BallPhysicsDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Ball Physics' };

export default function BallPhysicsPage() {
  return (
    <>
      <ExampleNav current="ball-physics" />
      <BallPhysicsDemo />
    </>
  );
}
