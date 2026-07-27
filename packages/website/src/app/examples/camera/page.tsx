import type { Metadata } from 'next';
import { exampleMetadata } from '@/lib/seo';
import CameraDemo from '@/demos/CameraDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = exampleMetadata('camera');

export default function CameraPage() {
  return (
    <>
      <ExampleNav current="camera" />
      <CameraDemo />
    </>
  );
}
