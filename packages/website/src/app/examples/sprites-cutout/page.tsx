import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import SpriteCompareDemo from '@/demos/SpriteCompareDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('sprites-cutout');

export default function SpritesCutoutPage() {
  return (
    <>
      <ExampleNav current="sprites-cutout" />
      <SpriteCompareDemo mode="cutout" />
    </>
  );
}
