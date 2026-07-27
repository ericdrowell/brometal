import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import ShadowDemo from '@/demos/ShadowDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('shadow');

export default function ShadowPage() {
  return (
    <>
      <ExampleNav current="shadow" />
      <ShadowDemo />
    </>
  );
}
