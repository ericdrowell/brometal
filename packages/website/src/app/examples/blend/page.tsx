import type { Metadata } from 'next';
import BlendDemo from '@/demos/BlendDemo';

export const metadata: Metadata = { title: 'BroMetal — Blend' };

export default function BlendPage() {
  return <BlendDemo />;
}
