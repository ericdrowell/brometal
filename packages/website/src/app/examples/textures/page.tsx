import type { Metadata } from 'next';
import TexturesDemo from '@/demos/TexturesDemo';

export const metadata: Metadata = { title: 'BroMetal — Texture' };

export default function TexturesPage() {
  return <TexturesDemo />;
}
