import type { Metadata } from 'next';
import InstancedCubesDemo from '@/demos/InstancedCubesDemo';

export const metadata: Metadata = { title: 'BroMetal — 125,000 Instanced Cubes' };

export default function InstancedCubesPage() {
  return <InstancedCubesDemo />;
}
