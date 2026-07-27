import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import BrocraftDemo from '@/demos/BrocraftDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('brocraft');

export default function BrocraftPage() {
  return (
    <>
      <ExampleNav current="brocraft" />
      <BrocraftDemo />
    </>
  );
}
