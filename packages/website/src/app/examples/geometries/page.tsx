import type { Metadata } from 'next';
import GeometriesDemo from '@/demos/GeometriesDemo';

export const metadata: Metadata = { title: 'BroMetal — Geometries' };

export default function GeometriesPage() {
  return <GeometriesDemo />;
}
