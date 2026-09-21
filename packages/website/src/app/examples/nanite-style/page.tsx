import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import NaniteStyleDemo from '@/demos/NaniteStyleDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('nanite-style');

export default function NaniteStylePage() {
  return (
    <>
      <ExampleNav current="nanite-style" />
      <NaniteStyleDemo />
    </>
  );
}
