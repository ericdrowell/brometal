import type { Metadata } from 'next';
import LightDemo from '@/demos/LightDemo';

export const metadata: Metadata = { title: 'BroMetal — Light' };

export default function LightPage() {
  return <LightDemo />;
}
