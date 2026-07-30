import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import SpriteSidescrollDemo from '@/demos/SpriteSidescrollDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('sprite-sidescroll');

export default function SpriteSidescrollPage() {
  return (
    <>
      <ExampleNav current="sprite-sidescroll" />
      <SpriteSidescrollDemo />
    </>
  );
}
