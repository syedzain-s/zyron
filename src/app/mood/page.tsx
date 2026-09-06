import type { Metadata } from 'next';
import { MoodCheckIn } from '@/components/console/MoodCheckIn';

export const metadata: Metadata = {
  title: 'Check in — ZYRON',
  description:
    'A camera, a few spoken words, or just tell it. ZYRON reads how you are doing and offers something small that might help.',
};

export default function MoodPage() {
  return (
    <main className="min-h-[100svh] pt-28">
      <MoodCheckIn />
    </main>
  );
}
