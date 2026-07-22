import type { Metadata } from 'next';
import TexturesWithLightDemo from '@/demos/TexturesWithLightDemo';

export const metadata: Metadata = { title: 'BroMetal — Textures with Light' };

export default function TexturesWithLightPage() {
  return <TexturesWithLightDemo />;
}
