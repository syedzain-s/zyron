'use client';

import { Mail, Phone } from 'lucide-react';

/**
 * Who built ZYRON, and how to reach them. Sits at the end of the landing page
 * in place of the generic call to action: anyone who has read this far wants
 * a person, not another button.
 */

interface Member {
  name: string;
  role: string;
  email?: string;
  phone?: string;
}

const TEAM: Member[] = [
  {
    name: 'Syed Zayn Ul Abideen Shah',
    role: 'Lead developer',
    email: 'syedzainishah123@gmail.com',
    phone: '0325 9302074',
  },
  {
    name: 'Israr Ul Haq',
    role: 'Team member',
    email: 'hafizisrar542@gmail.com',
  },
  {
    name: 'Hasnain Rabbani',
    role: 'Team member',
  },
];

export function AboutUs() {
  return (
    <section id="about" className="shell relative py-24 sm:py-32">
      <div className="max-w-2xl">
        <h2 className="font-display text-3xl text-cream sm:text-4xl">Built by three people who wanted their days back.</h2>
        <p className="mt-5 text-[1.0625rem] leading-[1.7] text-ash">
          ZYRON is a final-year project: a chief of staff that reads your mail, calendar and contracts,
          acts on the small things by itself, and stops at one gate for anything that touches the outside
          world. If you want to see it run on your own inbox, or you have a question, write to us.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM.map((m) => (
          <div key={m.name} className="panel flex flex-col p-6">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-gold/40 font-display text-lg text-gold">
              {initials(m.name)}
            </span>
            <h3 className="mt-5 font-display text-xl text-cream">{m.name}</h3>
            <p className="mt-1 text-sm text-ash">{m.role}</p>

            <div className="mt-6 space-y-2 border-t border-cream/8 pt-5 text-sm">
              {m.email && (
                <a
                  href={`mailto:${m.email}`}
                  className="flex items-center gap-2.5 text-cream/85 transition-colors hover:text-gold"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0 text-gold" />
                  <span className="truncate">{m.email}</span>
                </a>
              )}
              {m.phone && (
                <a
                  href={`tel:${m.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-2.5 text-cream/85 transition-colors hover:text-gold"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0 text-gold" />
                  <span>{m.phone}</span>
                </a>
              )}
              {!m.email && !m.phone && <p className="text-ash/60">Reach through the team.</p>}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-10 font-mono text-[0.68rem] text-ash/50">
        Wah Cantt, Pakistan · {new Date().getFullYear()}
      </p>
    </section>
  );
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter((p) => !/^(ul|al|syed)$/i.test(p));
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
