import type { Metadata } from 'next';
import CustomShaderDemo from '@/demos/CustomShaderDemo';

export const metadata: Metadata = { title: 'BroMetal — Custom Shader' };

export default function CustomShaderPage() {
  return <CustomShaderDemo />;
}
