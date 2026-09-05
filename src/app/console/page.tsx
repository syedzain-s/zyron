import type { Metadata } from 'next';
import { ConsoleClient } from '@/components/console/ConsoleClient';

export const metadata: Metadata = {
  title: 'Console — ZYRON',
  description: 'Give ZYRON a command and watch it route through the module register.',
};

export default function ConsolePage() {
  return <ConsoleClient />;
}
