import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import StarBroDemo from '@/demos/StarBroDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('star-bro');

export default function StarBroPage() {
  return (
    <>
      <ExampleNav current="star-bro" />
      <StarBroDemo />
    </>
  );
}
