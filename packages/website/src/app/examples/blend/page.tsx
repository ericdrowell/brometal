import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import BlendDemo from '@/demos/BlendDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('blend');

export default function BlendPage() {
  return (
    <>
      <ExampleNav current="blend" />
      <BlendDemo />
    </>
  );
}
