import type { Metadata } from 'next';
import TerrainDemo from '@/demos/TerrainDemo';

export const metadata: Metadata = { title: 'BroMetal — Terrain' };

export default function TerrainPage() {
  return <TerrainDemo />;
}
