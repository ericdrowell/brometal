import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import LightDemo from '@/demos/LightDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('light');

export default function LightPage() {
  return (
    <>
      <ExampleNav current="light" />
      <LightDemo />
    </>
  );
}
