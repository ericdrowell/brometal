import type { Metadata } from 'next';
import StarBroDemo from '@/demos/StarBroDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Star Bro' };

export default function StarBroPage() {
  return (
    <>
      <ExampleNav current="star-bro" />
      <StarBroDemo />
    </>
  );
}
