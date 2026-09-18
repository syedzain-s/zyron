'use client';

/**
 * SMS — your phone's text messages, from the laptop.
 *
 * Everything for this feature lives in this one file on purpose: it is a
 * proposal to look at, not a system to maintain yet. The data is mock. When the
 * companion app exists, the three places marked SERVER become fetches and the
 * page keeps its shape.
 *
 * Two states:
 *   1. Not linked   — a QR code the phone app scans once. After that the pairing
 *                     is remembered; nobody scans again.
 *   2. Linked       — contacts from the SIM on the left, one thread on the right,
 *                     a composer underneath. Only a click here sends anything.
 *
 * Deliberately absent: call logs, notifications, anything the phone knows
 * that is not a text message.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowUp,
  Battery,
  Check,
  CheckCheck,
  Clock3,
  Search,
  Signal,
  Smartphone,
  Unlink,
  X,
} from 'lucide-react';

/* ─────────────────────────── Types ─────────────────────────── */

type Delivery = 'queued' | 'sent' | 'delivered';

interface Sms {
  id: string;
  from: 'me' | 'them';
  text: string;
  at: number;
  status?: Delivery;
}

interface Contact {
  id: string;
  name: string;
  number: string;
  /** Business senders (banks, telcos) show as a tag, not a person. */
  kind: 'person' | 'service';
  unread: number;
  thread: Sms[];
}

interface LinkedPhone {
  name: string;
  sim: string;
  linkedAt: number;
  battery: number;
  signal: number;
}

/* ─────────────────────────── Mock data ─────────────────────────── */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const now = Date.now();

const CONTACTS: Contact[] = [
  {
    id: 'israr',
    name: 'Israr',
    number: '+92 300 1234567',
    kind: 'person',
    unread: 2,
    thread: [
      { id: 'i1', from: 'them', text: 'Bhai kal class hai?', at: now - 3 * HOUR },
      { id: 'i2', from: 'me', text: 'Haan 9 baje, DLD lab', at: now - 3 * HOUR + 4 * MINUTE, status: 'delivered' },
      { id: 'i3', from: 'them', text: 'Theek hai. Notes le ana', at: now - 40 * MINUTE },
      { id: 'i4', from: 'them', text: 'Aur chai bhi 😄', at: now - 39 * MINUTE },
    ],
  },
  {
    id: 'ammi',
    name: 'Ammi',
    number: '+92 321 7654321',
    kind: 'person',
    unread: 1,
    thread: [
      { id: 'a1', from: 'them', text: 'Beta ghar kab aao ge', at: now - 2 * HOUR },
      { id: 'a2', from: 'me', text: 'Shaam tak, lab hai', at: now - 2 * HOUR + 2 * MINUTE, status: 'delivered' },
      { id: 'a3', from: 'them', text: 'Theek hai, khana rakh dungi', at: now - 55 * MINUTE },
    ],
  },
  {
    id: 'hasnain',
    name: 'Hasnain Awan',
    number: '+92 333 9988776',
    kind: 'person',
    unread: 0,
    thread: [
      { id: 'h1', from: 'me', text: 'Kya kr rhay ho', at: now - 26 * HOUR, status: 'delivered' },
      { id: 'h2', from: 'them', text: 'Class la rha hn', at: now - 25 * HOUR },
    ],
  },
  {
    id: 'irtiza',
    name: 'Irtiza Mazhar',
    number: '+92 345 1122334',
    kind: 'person',
    unread: 0,
    thread: [
      { id: 'r1', from: 'them', text: 'FYP draft bhej do', at: now - 2 * 24 * HOUR },
      { id: 'r2', from: 'me', text: 'Aaj raat tak', at: now - 2 * 24 * HOUR + 10 * MINUTE, status: 'delivered' },
    ],
  },
  {
    id: 'mujtaba',
    name: 'Mujtaba Shah',
    number: '+92 301 5566778',
    kind: 'person',
    unread: 0,
    thread: [{ id: 'm1', from: 'them', text: 'Weekend pe milte hain', at: now - 3 * 24 * HOUR }],
  },
  {
    id: 'jazz',
    name: 'Jazz',
    number: '3311',
    kind: 'service',
    unread: 0,
    thread: [
      { id: 'j1', from: 'them', text: 'Your Weekly Bundle expires tomorrow. Dial *117*47# to renew. Rs 120.', at: now - 5 * HOUR },
    ],
  },
  {
    id: 'hbl',
    name: 'HBL',
    number: '8008',
    kind: 'service',
    unread: 0,
    thread: [
      { id: 'b1', from: 'them', text: 'Rs 2,500 debited from A/C ***4412 at Easypaisa on 18-Sep. Avl bal Rs 14,320.', at: now - 20 * HOUR },
    ],
  },
  {
    id: 'aiman',
    name: 'Aiman Atif',
    number: '+92 312 4433221',
    kind: 'person',
    unread: 0,
    thread: [{ id: 'q1', from: 'me', text: 'Assignment submit ho gayi?', at: now - 4 * 24 * HOUR, status: 'delivered' }],
  },
];

const PHONE: LinkedPhone = {
  name: 'Samsung Galaxy A54',
  sim: 'Jazz · 0300 1234567',
  linkedAt: now - 2 * 24 * HOUR,
  battery: 78,
  signal: 4,
};

/* ─────────────────────────── Helpers ─────────────────────────── */

const LINK_KEY = 'zyron:phone-link';

const shortId = () => Math.random().toString(36).slice(2, 9);

function clock(at: number) {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function when(at: number) {
  const diff = now - at;
  if (diff < 24 * HOUR && new Date(at).getDate() === new Date().getDate()) return clock(at);
  if (diff < 48 * HOUR) return 'Yesterday';
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** A pairing code the phone app would exchange for a long-lived token. SERVER later. */
function makePairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function SmsPage() {
  const [linked, setLinked] = useState<LinkedPhone | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LINK_KEY);
      if (raw) setLinked(JSON.parse(raw) as LinkedPhone);
    } catch {
      /* storage unavailable: start unlinked */
    }
    setHydrated(true);
  }, []);

  const link = useCallback((phone: LinkedPhone) => {
    try {
      window.localStorage.setItem(LINK_KEY, JSON.stringify(phone));
    } catch {
      /* fine, this session only */
    }
    setLinked(phone);
  }, []);

  const unlink = useCallback(() => {
    if (!window.confirm('Unlink this phone? Messages here will disappear until you scan again.')) return;
    try {
      window.localStorage.removeItem(LINK_KEY);
    } catch {
      /* nothing to remove */
    }
    void fetch('/api/link', { method: 'DELETE' }).catch(() => undefined);
    setLinked(null);
  }, []);

  return (
    <div className="relative flex h-[100svh] flex-col overflow-hidden bg-ink pt-[4.5rem]">
      <AnimatePresence mode="wait">
        {!hydrated ? (
          <div key="loading" className="grid flex-1 place-items-center font-mono text-xs text-ash">
            Checking for a linked phone
          </div>
        ) : linked ? (
          <motion.div
            key="messages"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Messages phone={linked} onUnlink={unlink} />
          </motion.div>
        ) : (
          <motion.div
            key="link"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <LinkPhone onLinked={link} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── State 1: Link ─────────────────────────── */

const CODE_LIFETIME = 60;

function LinkPhone({ onLinked }: { onLinked: (phone: LinkedPhone) => void }) {
  const [code, setCode] = useState(makePairingCode);
  const [left, setLeft] = useState(CODE_LIFETIME);
  const [manual, setManual] = useState(false);

  // A pairing code is only good for a minute. A stale QR on a screen someone
  // walked away from must not link a stranger's phone.
  useEffect(() => {
    const id = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          setCode(makePairingCode());
          return CODE_LIFETIME;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const payload = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zyron-iota.vercel.app';
    return `${origin}/link?code=${code}`;
  }, [code]);

  // Tell the server this code is live, then ask every two seconds whether a
  // phone has claimed it. The previous code is checked too, so a scan that
  // lands right as the code rotates is not lost.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    void fetch('/api/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open', code }),
    }).catch(() => undefined);
    const prev = previous.current;
    previous.current = code;

    const id = window.setInterval(async () => {
      for (const c of [code, prev].filter(Boolean) as string[]) {
        try {
          const res = await fetch(`/api/link?code=${c}`, { cache: 'no-store' });
          const data = (await res.json()) as { status?: string; phone?: LinkedPhone };
          if (data.status === 'linked' && data.phone) {
            window.clearInterval(id);
            onLinked(data.phone);
            return;
          }
        } catch {
          /* try again next tick */
        }
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [code, onLinked]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center overflow-y-auto px-5 py-10">
      <div className="panel grid gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="max-w-lg">
          <h1 className="font-display text-3xl text-cream sm:text-4xl">Link your phone</h1>
          <p className="mt-4 text-[1.0625rem] leading-[1.7] text-ash">
            Your SIM&rsquo;s text messages and contacts appear here. Scan once; the link is remembered
            until you remove it.
          </p>

          <ol className="mt-8 space-y-4 text-[0.95rem] text-cream/90">
            <Step n={1}>Open the camera on your phone</Step>
            <Step n={2}>Point it at this code and open the link</Step>
            <Step n={3}>
              Tap <span className="text-gold">Link this phone</span>
            </Step>
          </ol>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-ash">
            <button onClick={() => setManual((v) => !v)} className="underline decoration-ash/40 underline-offset-4 hover:text-cream">
              {manual ? 'Show the QR code instead' : 'Type a code on the phone instead'}
            </button>
            <span className="font-mono text-ash/60">Android only — iPhone does not allow SMS access</span>
          </div>

          <p className="mt-6 max-w-md text-xs leading-relaxed text-ash/60">
            Messages are read and sent by your phone through the ZYRON Link app. ZYRON never sends a
            text on its own; only what you write here goes out, and only when you press send.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="relative rounded-2xl border border-gold/25 bg-cream p-4">
            {manual ? (
              <div className="grid h-[232px] w-[232px] place-items-center">
                <div className="text-center">
                  <span className="font-mono text-3xl tracking-[0.3em] text-ink">{code.slice(0, 4)}</span>
                  <span className="mx-1 font-mono text-3xl text-ink/40">·</span>
                  <span className="font-mono text-3xl tracking-[0.3em] text-ink">{code.slice(4)}</span>
                </div>
              </div>
            ) : (
              <QrCode data={payload} size={232} />
            )}
            <AnimatePresence>
              {left <= 8 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 grid place-items-center rounded-2xl bg-cream/85"
                >
                  <span className="font-mono text-xs text-ink">New code in {left}s</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <span className="font-mono text-[0.68rem] text-ash/60">
            Code refreshes in {left}s
          </span>

          {/* Testing on one machine, with no phone to hand. */}
          <button
            onClick={() => onLinked({ ...PHONE, linkedAt: Date.now() })}
            className="mt-2 rounded-xl border border-dashed border-gold/40 px-4 py-2 text-xs text-gold transition-colors hover:bg-gold/10"
          >
            Simulate a scan (prototype)
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-4">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gold/40 font-mono text-[0.65rem] text-gold">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

/**
 * The QR itself. A hosted encoder keeps this file free of a QR library; if that
 * image cannot load, a placeholder pattern keeps the layout honest.
 */
function QrCode({ data, size }: { data: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&color=0e0f13&bgcolor=f5efe2&data=${encodeURIComponent(data)}`;

  if (failed) {
    return (
      <div className="grid h-[232px] w-[232px] place-items-center rounded-lg border border-ink/15 bg-cream text-center">
        <span className="px-6 font-mono text-[0.68rem] text-ink/60">QR unavailable offline — use the typed code</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Pairing code" width={size} height={size} onError={() => setFailed(true)} className="block" />;
}

/* ─────────────────────────── State 2: Messages ─────────────────────────── */

function Messages({ phone, onUnlink }: { phone: LinkedPhone; onUnlink: () => void }) {
  const [contacts, setContacts] = useState<Contact[]>(CONTACTS); // SERVER: contacts + threads from the phone
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const active = contacts.find((c) => c.id === activeId) ?? null;

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...contacts]
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.number.replace(/\s/g, '').includes(q.replace(/\s/g, '')))
      .sort((a, b) => (b.thread.at(-1)?.at ?? 0) - (a.thread.at(-1)?.at ?? 0));
  }, [contacts, query]);

  const open = useCallback((id: string) => {
    setActiveId(id);
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  }, []);

  const send = useCallback((id: string, text: string) => {
    const msg: Sms = { id: shortId(), from: 'me', text, at: Date.now(), status: 'queued' };
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, thread: [...c.thread, msg] } : c)));

    // SERVER: POST to the phone via the companion app; these timers stand in
    // for "phone picked it up" and "carrier confirmed delivery".
    const advance = (status: Delivery, delay: number) =>
      window.setTimeout(() => {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, thread: c.thread.map((m) => (m.id === msg.id ? { ...m, status } : m)) } : c,
          ),
        );
      }, delay);
    advance('sent', 900);
    advance('delivered', 2400);
  }, []);

  const unreadTotal = contacts.reduce((n, c) => n + c.unread, 0);

  return (
    <div className="flex min-h-0 flex-1">
      {/* Contacts */}
      <aside
        className={`flex w-full shrink-0 flex-col border-r bg-ink/70 backdrop-blur-xl md:w-[320px] lg:w-[360px] ${
          active ? 'hidden md:flex' : 'flex'
        }`}
      >
        <PhoneBar phone={phone} onUnlink={onUnlink} />

        <div className="px-3 pb-2 pt-3">
          <label className="flex items-center gap-2 rounded-xl border bg-cream/[0.03] px-3 py-2 focus-within:border-gold/40">
            <Search className="h-3.5 w-3.5 shrink-0 text-ash/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or number"
              className="min-w-0 flex-1 bg-transparent text-sm text-cream outline-none placeholder:text-ash/50"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search" className="text-ash hover:text-cream">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
        </div>

        <div className="flex items-baseline justify-between px-5 pb-2 pt-1">
          <span className="text-xs text-ash">{contacts.length} contacts from SIM</span>
          {unreadTotal > 0 && <span className="font-mono text-[0.65rem] text-gold">{unreadTotal} unread</span>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {sorted.length === 0 ? (
            <p className="px-3 py-6 text-sm text-ash/70">No contact matches that. Try the number.</p>
          ) : (
            sorted.map((c) => <ContactRow key={c.id} contact={c} active={c.id === activeId} onOpen={() => open(c.id)} />)
          )}
        </div>
      </aside>

      {/* Thread */}
      <main className={`relative min-w-0 flex-1 flex-col ${active ? 'flex' : 'hidden md:flex'}`}>
        {active ? (
          <Thread contact={active} onBack={() => setActiveId(null)} onSend={(text) => send(active.id, text)} />
        ) : (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <Smartphone className="mx-auto h-6 w-6 text-gold" />
              <p className="mt-4 font-display text-xl text-cream">Pick a contact</p>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-ash">
                Texts you send from here go out from {phone.sim.split(' · ')[0]} on your phone.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function PhoneBar({ phone, onUnlink }: { phone: LinkedPhone; onUnlink: () => void }) {
  const bars = Array.from({ length: 4 }, (_, i) => i < phone.signal);
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-signal-ok/25 bg-signal-ok/[0.06]">
        <Smartphone className="h-4 w-4 text-signal-ok" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-cream">{phone.name}</p>
        <p className="truncate font-mono text-[0.65rem] text-ash">{phone.sim}</p>
      </div>
      <div className="flex items-center gap-2 font-mono text-[0.65rem] text-ash" title={`Linked ${when(phone.linkedAt)}`}>
        <span className="flex items-end gap-px" aria-label={`Signal ${phone.signal} of 4`}>
          {bars.map((on, i) => (
            <span key={i} className={`w-0.5 rounded-sm ${on ? 'bg-signal-ok' : 'bg-ash/30'}`} style={{ height: 4 + i * 2 }} />
          ))}
        </span>
        <span className="flex items-center gap-1">
          <Battery className="h-3.5 w-3.5" />
          {phone.battery}%
        </span>
      </div>
      <button
        onClick={onUnlink}
        aria-label="Unlink phone"
        title="Unlink phone"
        className="rounded-lg p-1.5 text-ash transition-colors hover:bg-cream/5 hover:text-signal-risk"
      >
        <Unlink className="h-4 w-4" />
      </button>
    </div>
  );
}

function ContactRow({ contact, active, onOpen }: { contact: Contact; active: boolean; onOpen: () => void }) {
  const last = contact.thread.at(-1);
  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-gold/12' : 'hover:bg-cream/[0.04]'
      }`}
    >
      <Avatar contact={contact} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${contact.unread ? 'text-cream' : 'text-cream/85'}`}>{contact.name}</span>
          {last && <span className="shrink-0 font-mono text-[0.62rem] text-ash/60">{when(last.at)}</span>}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={`truncate text-xs ${contact.unread ? 'text-cream/80' : 'text-ash'}`}>
            {last ? (last.from === 'me' ? `You: ${last.text}` : last.text) : contact.number}
          </span>
          {contact.unread > 0 && (
            <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-gold px-1 font-mono text-[0.6rem] text-ink">
              {contact.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function Avatar({ contact }: { contact: Contact }) {
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border font-mono text-[0.68rem] ${
        contact.kind === 'service' ? 'border-ash/30 text-ash' : 'border-gold/35 text-gold'
      }`}
    >
      {contact.kind === 'service' ? contact.name.slice(0, 3).toUpperCase() : initials(contact.name)}
    </span>
  );
}

/* ─────────────────────────── Thread ─────────────────────────── */

function Thread({ contact, onBack, onSend }: { contact: Contact; onBack: () => void; onSend: (text: string) => void }) {
  const [draft, setDraft] = useState('');
  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [contact.id, contact.thread.length]);

  useEffect(() => {
    setDraft('');
    inputRef.current?.focus();
  }, [contact.id]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
    inputRef.current?.focus();
  };

  // SMS is billed and sized per 160 characters (70 for Urdu script). Showing
  // the count is the one bit of SMS reality worth surfacing in the composer.
  const unicode = /[^\u0000-\u007f]/.test(draft);
  const per = unicode ? 70 : 160;
  const parts = draft.length === 0 ? 0 : Math.ceil(draft.length / per);

  const days = groupByDay(contact.thread);

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button onClick={onBack} aria-label="Back to contacts" className="rounded-lg p-1.5 text-ash hover:text-cream md:hidden">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar contact={contact} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-cream">{contact.name}</p>
          <p className="truncate font-mono text-[0.65rem] text-ash">
            {contact.number}
            {contact.kind === 'service' && ' · service number, replies may not be read'}
          </p>
        </div>
        <span className="hidden font-mono text-[0.62rem] text-ash/50 sm:block">SMS</span>
      </div>

      <div ref={streamRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {days.map(([day, msgs]) => (
            <div key={day} className="space-y-2">
              <div className="flex justify-center">
                <span className="rounded-full border bg-ink/60 px-3 py-1 font-mono text-[0.62rem] text-ash/70">{day}</span>
              </div>
              {msgs.map((m) => (
                <Bubble key={m.id} sms={m} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t bg-ink/80 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border bg-cream/[0.03] p-2.5 focus-within:border-gold/40">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Text ${contact.name}`}
            className="max-h-40 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-cream outline-none placeholder:text-ash/50"
          />
          <button
            onClick={submit}
            disabled={!draft.trim()}
            aria-label="Send text"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold text-ink transition-opacity disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className="mx-auto mt-2 flex max-w-2xl justify-between font-mono text-[0.65rem] text-ash/45">
          <span>Enter to send · Shift+Enter for a new line</span>
          <span>
            {draft.length}/{per}
            {parts > 1 && ` · ${parts} texts`}
          </span>
        </p>
      </div>
    </>
  );
}

function Bubble({ sms }: { sms: Sms }) {
  const mine = sms.from === 'me';
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          mine
            ? 'rounded-br-md border border-gold/20 bg-gold/[0.07] text-cream'
            : 'rounded-bl-md border bg-cream/[0.03] text-cream/90'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{sms.text}</p>
        <p className={`mt-1 flex items-center gap-1 font-mono text-[0.6rem] ${mine ? 'justify-end text-ash/60' : 'text-ash/50'}`}>
          {clock(sms.at)}
          {mine && <DeliveryMark status={sms.status} />}
        </p>
      </div>
    </motion.div>
  );
}

function DeliveryMark({ status }: { status?: Delivery }) {
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-signal-ok" aria-label="Delivered" />;
  if (status === 'sent') return <Check className="h-3 w-3" aria-label="Sent from phone" />;
  return <Clock3 className="h-3 w-3 animate-pulse" aria-label="Waiting for phone" />;
}

function groupByDay(thread: Sms[]): Array<[string, Sms[]]> {
  const map = new Map<string, Sms[]>();
  for (const m of thread) {
    const d = new Date(m.at);
    const key =
      d.toDateString() === new Date().toDateString()
        ? 'Today'
        : d.toDateString() === new Date(now - 24 * HOUR).toDateString()
          ? 'Yesterday'
          : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    map.set(key, [...(map.get(key) ?? []), m]);
  }
  return Array.from(map.entries());
}
