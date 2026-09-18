'use client';

/**
 * /link — what opens on the phone after scanning the QR.
 *
 * This is the phone's half of the handshake. It shows what is about to be
 * linked, asks once, and tells the server. The laptop, which is polling the
 * same code, flips to the SMS view on its own.
 *
 * Reading and sending texts still needs the ZYRON Link Android app; a browser
 * cannot touch the SIM. This page proves the pairing and remembers it.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Laptop, ShieldCheck, Smartphone } from 'lucide-react';

export default function LinkPage() {
  return (
    <Suspense fallback={null}>
      <LinkInner />
    </Suspense>
  );
}

function LinkInner() {
  const params = useSearchParams();
  const code = (params.get('code') ?? '').toUpperCase();

  const [phoneName, setPhoneName] = useState('');
  const [sim, setSim] = useState('');
  const [state, setState] = useState<'idle' | 'linking' | 'done' | 'expired' | 'error'>('idle');

  // A reasonable default name from the browser, editable.
  useEffect(() => {
    const ua = navigator.userAgent;
    const guess =
      /iPhone/.test(ua) ? 'iPhone' : /SM-|Samsung/i.test(ua) ? 'Samsung Galaxy' : /Pixel/.test(ua) ? 'Google Pixel' : /Android/.test(ua) ? 'Android phone' : 'This device';
    setPhoneName(guess);
  }, []);

  const isIphone = useMemo(() => /iPhone|iPad/.test(typeof navigator === 'undefined' ? '' : navigator.userAgent), []);

  const link = async () => {
    setState('linking');
    try {
      const res = await fetch('/api/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim',
          code,
          phone: {
            name: phoneName.trim() || 'Phone',
            sim: sim.trim() || 'SIM',
            battery: 100,
            signal: 4,
          },
        }),
      });
      if (res.status === 404) return setState('expired');
      if (!res.ok) return setState('error');
      setState('done');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="min-h-[100svh] bg-ink px-5 pb-10 pt-[5.5rem] text-cream">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-center gap-4 text-ash">
          <Smartphone className="h-6 w-6 text-gold" />
          <span className="h-px w-10 bg-gold/40" />
          <Laptop className="h-6 w-6 text-gold" />
        </div>

        {!code ? (
          <div className="panel mt-8 p-6">
            <h1 className="font-display text-2xl">No code in this link</h1>
            <p className="mt-3 text-sm leading-relaxed text-ash">
              Open the SMS page on your laptop and scan the QR code it shows.
            </p>
          </div>
        ) : state === 'done' ? (
          <div className="panel panel-gold mt-8 p-6 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gold text-ink">
              <Check className="h-6 w-6" />
            </span>
            <h1 className="mt-5 font-display text-2xl">Linked</h1>
            <p className="mt-3 text-sm leading-relaxed text-ash">
              Your laptop is switching to your messages now. You can close this page.
            </p>
            <p className="mt-6 border-t border-cream/10 pt-4 text-xs leading-relaxed text-ash/70">
              To sync real texts, install the ZYRON Link app on this phone. It uses this same link, so
              you will not scan again.
            </p>
          </div>
        ) : state === 'expired' ? (
          <div className="panel mt-8 p-6">
            <h1 className="font-display text-2xl">That code has expired</h1>
            <p className="mt-3 text-sm leading-relaxed text-ash">
              Codes last one minute. Scan the fresh one on the laptop screen.
            </p>
          </div>
        ) : (
          <div className="panel mt-8 p-6">
            <h1 className="font-display text-2xl">Link this phone to ZYRON?</h1>
            <p className="mt-3 text-sm leading-relaxed text-ash">
              Your laptop will show this phone&rsquo;s text messages and SIM contacts. Nothing is
              sent unless you press send there.
            </p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs text-ash">Phone name</span>
                <input
                  value={phoneName}
                  onChange={(e) => setPhoneName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border bg-cream/[0.03] px-3 py-2.5 text-sm text-cream outline-none focus:border-gold/40"
                />
              </label>
              <label className="block">
                <span className="text-xs text-ash">SIM (network and number)</span>
                <input
                  value={sim}
                  onChange={(e) => setSim(e.target.value)}
                  placeholder="Jazz · 0300 1234567"
                  inputMode="tel"
                  className="mt-1.5 w-full rounded-xl border bg-cream/[0.03] px-3 py-2.5 text-sm text-cream outline-none placeholder:text-ash/40 focus:border-gold/40"
                />
              </label>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl border border-gold/20 bg-gold/[0.05] px-3 py-2.5 font-mono text-[0.68rem] text-ash">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-gold" />
              Code {code.slice(0, 4)}&nbsp;{code.slice(4)}
            </div>

            {isIphone && (
              <p className="mt-4 text-xs leading-relaxed text-signal-risk">
                This is an iPhone. Apple does not allow apps to read SMS, so texts will not sync from
                this device. The pairing will still work for testing.
              </p>
            )}

            {state === 'error' && (
              <p className="mt-4 text-xs text-signal-risk">Could not reach ZYRON. Check the connection and try again.</p>
            )}

            <button
              onClick={link}
              disabled={state === 'linking'}
              className="mt-6 w-full rounded-xl bg-gold py-3 text-sm font-medium text-ink disabled:opacity-50"
            >
              {state === 'linking' ? 'Linking…' : 'Link this phone'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
