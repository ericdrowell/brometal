import type { Metadata } from 'next';
import LightDemo from '@/demos/LightDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Light' };

export default function LightPage() {
  return (
    <>
      <ExampleNav current="light" />
      <LightDemo />
    </>
  );
}
