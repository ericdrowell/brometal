import type { Metadata } from 'next';
import ModelDemo from '@/demos/ModelDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Model' };

export default function ModelPage() {
  return (
    <>
      <ExampleNav current="model" />
      <ModelDemo />
    </>
  );
}
