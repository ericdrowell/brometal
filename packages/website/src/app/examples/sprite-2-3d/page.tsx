import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import Sprite23DDemo from '@/demos/Sprite23DDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('sprite-2-3d');

export default function Sprite23DPage() {
  return (
    <>
      <ExampleNav current="sprite-2-3d" />
      <Sprite23DDemo />
    </>
  );
}
