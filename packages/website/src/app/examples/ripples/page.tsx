import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import RippleDemo from '@/demos/RippleDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('ripples');

export default function RipplesPage() {
  return (
    <>
      <ExampleNav current="ripples" />
      <RippleDemo />
    </>
  );
}
