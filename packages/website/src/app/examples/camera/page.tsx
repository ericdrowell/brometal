import type { Metadata } from 'next';
import CameraDemo from '@/demos/CameraDemo';

export const metadata: Metadata = { title: 'BroMetal — Camera' };

export default function CameraPage() {
  return <CameraDemo />;
}
