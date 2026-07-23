import type { Metadata } from 'next';
import ShaderFunctionsDemo from '@/demos/ShaderFunctionsDemo';

export const metadata: Metadata = { title: 'BroMetal — Shader Functions' };

export default function ShaderFunctionsPage() {
  return <ShaderFunctionsDemo />;
}
