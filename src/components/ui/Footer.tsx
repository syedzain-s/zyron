import Link from 'next/link';

const COLUMNS = [
  {
    title: 'System',
    links: [
      { label: 'Architecture', href: '/#architecture' },
      { label: 'Module register', href: '/#modules' },
      { label: 'Approval gate', href: '/#approval' },
      { label: 'Build stack', href: '/#stack' },
    ],
  },
  {
    title: 'Use it',
    links: [
      { label: 'Console', href: '/console' },
      { label: 'Approval queue', href: '/console' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/8 py-16">
      <div className="shell grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <span className="font-display text-lg tracking-[0.28em] text-cream">ZYRON</span>
          <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-ash/65">
            An autonomous executive intelligence system. Twenty-three modules, one
            orchestrator, and a gate that will not open without you.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <span className="data-label">{col.title}</span>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-ash/75 transition-colors hover:text-cream"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="shell mt-12 flex flex-col gap-3 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-xs text-ash/45">
          ZYRON — final year project build
        </p>
        <p className="font-mono text-xs text-ash/45">
          Data stays on your side of the gate.
        </p>
      </div>
    </footer>
  );
}
