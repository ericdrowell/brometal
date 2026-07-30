import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import SpriteCompareDemo from '@/demos/SpriteCompareDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('sprites-blended');

export default function SpritesBlendedPage() {
  return (
    <>
      <ExampleNav current="sprites-blended" />
      <SpriteCompareDemo mode="blend" />
    </>
  );
}
