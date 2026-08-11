import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import RipplesDemo from '@/demos/RipplesDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('ripples');

export default function RipplesPage() {
  return (
    <>
      <ExampleNav current="ripples" />
      <RipplesDemo />
    </>
  );
}
