import type { Metadata } from 'next';
import StarfighterDemo from '@/demos/StarfighterDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Starfighter' };

export default function StarfighterPage() {
  return (
    <>
      <ExampleNav current="starfighter" />
      <StarfighterDemo />
    </>
  );
}
