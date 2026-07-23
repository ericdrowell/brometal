import type { Metadata } from 'next';
import LotsOfCubesDemo from '@/demos/LotsOfCubesDemo';

export const metadata: Metadata = { title: 'BroMetal — Lots of Cubes' };

export default function LotsOfCubesPage() {
  return <LotsOfCubesDemo />;
}
