import type { Metadata } from 'next';
import RippleDemo from '@/demos/RippleDemo';

export const metadata: Metadata = { title: 'BroMetal — Ripples' };

export default function RipplesPage() {
  return <RippleDemo />;
}
