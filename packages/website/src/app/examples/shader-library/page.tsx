import type { Metadata } from 'next';
import ShaderLibraryDemo from '@/demos/ShaderLibraryDemo';

export const metadata: Metadata = { title: 'BroMetal — Shader Library' };

export default function ShaderLibraryPage() {
  return <ShaderLibraryDemo />;
}
