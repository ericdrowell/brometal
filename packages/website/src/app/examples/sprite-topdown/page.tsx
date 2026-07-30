import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import SpriteTopdownDemo from '@/demos/SpriteTopdownDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('sprite-topdown');

export default function SpriteTopdownPage() {
  return (
    <>
      <ExampleNav current="sprite-topdown" />
      <SpriteTopdownDemo />
    </>
  );
}
