import type { Metadata } from 'next';
import BlendDemo from '@/demos/BlendDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Blend' };

export default function BlendPage() {
  return (
    <>
      <ExampleNav current="blend" />
      <BlendDemo />
    </>
  );
}
