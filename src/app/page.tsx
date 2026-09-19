import { Hero } from '@/components/sections/Hero';
import { AboutUs } from '@/components/sections/AboutUs';
import { Architecture } from '@/components/sections/Architecture';
import { Modules } from '@/components/sections/Modules';
import { Stack } from '@/components/sections/Stack';
import { Footer } from '@/components/ui/Footer';

export default function HomePage() {
  return (
    <>
      <main>
        <Hero />
        <Architecture />
        <Modules />
        <Stack />
        <AboutUs />
      </main>
      <Footer />
    </>
  );
}
