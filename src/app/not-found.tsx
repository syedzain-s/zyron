import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="grid min-h-[100svh] place-items-center px-6">
      <div className="text-center">
        <p className="font-mono text-xs text-gold">No route matched</p>
        <h1 className="mt-4 font-display text-display-md">That address is not in the register.</h1>
        <p className="mx-auto mt-4 max-w-[46ch] text-ash/70">
          The orchestrator only knows two surfaces: the system overview and the console.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/">
            <Button>Back to the overview</Button>
          </Link>
          <Link href="/console">
            <Button variant="ghost">Open the console</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
