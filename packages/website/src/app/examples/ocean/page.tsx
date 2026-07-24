import type { Metadata } from 'next';
import OceanDemo from '@/demos/OceanDemo';

export const metadata: Metadata = { title: 'BroMetal — Ocean' };

export default function OceanPage() {
  return <OceanDemo />;
}
