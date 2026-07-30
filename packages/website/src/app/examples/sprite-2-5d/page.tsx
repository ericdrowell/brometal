import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import Sprite25DDemo from '@/demos/Sprite25DDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('sprite-2-5d');

export default function Sprite25DPage() {
  return (
    <>
      <ExampleNav current="sprite-2-5d" />
      <Sprite25DDemo />
    </>
  );
}
