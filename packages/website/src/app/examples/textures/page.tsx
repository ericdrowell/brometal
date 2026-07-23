import type { Metadata } from 'next';
import TexturesDemo from '@/demos/TexturesDemo';

export const metadata: Metadata = { title: 'BroMetal — Textures' };

export default function TexturesPage() {
  return <TexturesDemo />;
}
