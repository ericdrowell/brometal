import type { Metadata } from 'next';
import CustomShaderDemo from '@/demos/CustomShaderDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Custom Shader' };

export default function CustomShaderPage() {
  return (
    <>
      <ExampleNav current="custom-shader" />
      <CustomShaderDemo />
    </>
  );
}
