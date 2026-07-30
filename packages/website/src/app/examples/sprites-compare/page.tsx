import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import SpriteSplitDemo from '@/demos/SpriteSplitDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('sprites-compare');

export default function SpritesComparePage() {
  return (
    <>
      <ExampleNav current="sprites-compare" />
      <SpriteSplitDemo />
    </>
  );
}
