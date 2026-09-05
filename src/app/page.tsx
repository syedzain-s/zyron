import { Hero } from '@/components/sections/Hero';
import { Architecture } from '@/components/sections/Architecture';
import { Modules } from '@/components/sections/Modules';
import { DayInTheLife } from '@/components/sections/DayInTheLife';
import { ApprovalGate } from '@/components/sections/ApprovalGate';
import { Stack } from '@/components/sections/Stack';
import { CallToAction } from '@/components/sections/CallToAction';
import { Footer } from '@/components/ui/Footer';

export default function HomePage() {
  return (
    <>
      <main>
        <Hero />
        <Architecture />
        <Modules />
        <DayInTheLife />
        <ApprovalGate />
        <Stack />
        <CallToAction />
      </main>
      <Footer />
    </>
  );
}
