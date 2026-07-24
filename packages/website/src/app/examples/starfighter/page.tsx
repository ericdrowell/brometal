import type { Metadata } from 'next';
import StarfighterDemo from '@/demos/StarfighterDemo';

export const metadata: Metadata = { title: 'BroMetal — Starfighter' };

export default function StarfighterPage() {
  return <StarfighterDemo />;
}
