import type { Metadata } from 'next';
import CameraDemo from '@/demos/CameraDemo';
import ExampleNav from '@/components/ExampleNav';

export const metadata: Metadata = { title: 'BroMetal — Camera' };

export default function CameraPage() {
  return (
    <>
      <ExampleNav current="camera" />
      <CameraDemo />
    </>
  );
}
