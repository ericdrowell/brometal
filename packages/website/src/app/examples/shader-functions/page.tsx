import type { Metadata } from 'next';
import ShaderFunctionsDemo from '@/demos/ShaderFunctionsDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Shader Functions' };

export default function ShaderFunctionsPage() {
  return (
    <>
      <ExampleNav current="shader-functions" />
      <ShaderFunctionsDemo />
    </>
  );
}
