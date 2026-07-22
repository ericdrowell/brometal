import type { Metadata } from 'next';
import RotatingCubeDemo from '@/demos/RotatingCubeDemo';

export const metadata: Metadata = { title: 'BroMetal — Rotating Cube' };

export default function RotatingCubePage() {
  return <RotatingCubeDemo />;
}
