import type { Metadata } from 'next';
import BrocraftDemo from '@/demos/BrocraftDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Brocraft' };

export default function BrocraftPage() {
  return (
    <>
      <ExampleNav current="brocraft" />
      <BrocraftDemo />
    </>
  );
}
