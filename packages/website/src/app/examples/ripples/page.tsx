import type { Metadata } from 'next';
import RippleDemo from '@/demos/RippleDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Ripples' };

export default function RipplesPage() {
  return (
    <>
      <ExampleNav current="ripples" />
      <RippleDemo />
    </>
  );
}
