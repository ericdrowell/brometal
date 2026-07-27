import type { Metadata } from 'next';
import ShadowDemo from '@/demos/ShadowDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Shadow' };

export default function ShadowPage() {
  return (
    <>
      <ExampleNav current="shadow" />
      <ShadowDemo />
    </>
  );
}
