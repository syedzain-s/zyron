'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Camera, Check, Loader2, Mic, Pause, Play, RotateCcw, ShieldCheck, Square, X,
} from 'lucide-react';
import { SceneCanvas } from '@/components/three/SceneCanvas';
import { AgentAvatar, type AvatarState } from '@/components/three/AgentAvatar';
import { StageLights } from '@/components/three/StageLights';
import { MOODS, type Mood, type Soundscape, type Technique } from '@/lib/agent/mood';
import { cn } from '@/lib/utils';

/* ─────────────────────────── Types from the API ─────────────────────────── */

interface Suggestion {
  mood: Mood;
  reading: string;
  techniques: Technique[];
  soundscapes: Soundscape[];
}

interface Reading {
  checkInId: string | null;
  mood: Mood;
  label: string;
  confidence: number;
  observation: string;
  question: string;
  suggestion: Suggestion;
  worksForYou: Array<{ techniqueId: string; title: string; tried: number; helped: number; rate: number }>;
}

interface History {
  trend: Array<{ day: string; score: number; count: number }>;
  worksForYou: Array<{ techniqueId: string; title: string; tried: number; helped: number; rate: number }>;
  workload: { message: string | null; daysCompared: number };
  capabilities: { provider: string; camera: boolean; voice: boolean };
}

type Stage = 'capture' | 'reading' | 'confirm' | 'suggest' | 'support';

const MOOD_KEYS = Object.keys(MOODS) as Mood[];

export function MoodCheckIn() {
  const [stage, setStage] = useState<Stage>('capture');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [support, setSupport] = useState<{ title: string; body: string; note: string } | null>(null);
  const [history, setHistory] = useState<History | null>(null);

  useEffect(() => {
    fetch('/api/mood', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => undefined);
  }, []);

  const refreshHistory = useCallback(() => {
    fetch('/api/mood', { cache: 'no-store' }).then((r) => r.json()).then(setHistory).catch(() => undefined);
  }, []);

  const submit = useCallback(
    async (payload: Record<string, unknown>, label: string) => {
      setBusy(label);
      setError(null);
      try {
        const res = await fetch('/api/mood', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (data.support) {
          setSupport(data.support);
          setStage('support');
          return;
        }
        if (!res.ok) throw new Error(data.error ?? 'That check-in did not go through.');

        setReading(data as Reading);
        setStage(payload.source === 'manual' ? 'suggest' : 'confirm');
        refreshHistory();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      } finally {
        setBusy(null);
      }
    },
    [refreshHistory],
  );

  const reset = () => {
    setStage('capture');
    setReading(null);
    setSupport(null);
    setError(null);
  };

  const avatarState: AvatarState =
    busy ? 'thinking' : stage === 'suggest' ? 'activity' : stage === 'confirm' ? 'speaking' : 'idle';

  return (
    <div className="shell relative py-14">
      {/* Fixed to the viewport rather than parked at the top of the page, so it
          stays with you through the whole flow instead of scrolling away the
          moment the activities appear.

          The camera sits well back and the model is scaled down: at the
          previous distance a standing figure filled the frame and the head was
          cropped by the header. */}
      <div className="pointer-events-none fixed bottom-0 right-0 z-0 hidden h-[68vh] w-[34vw] max-w-[520px] lg:block">
        <SceneCanvas label="mood-avatar" camera={{ position: [0, 1.1, 12], fov: 38 }}>
          <StageLights />
          <AgentAvatar state={avatarState} position={[0, -1.4, 0]} followPointer={false} />
        </SceneCanvas>
      </div>

      <header className="relative z-10 mb-12 max-w-3xl">
        <span className="eyebrow">BIO · Energy &amp; Stress</span>
        <h1 className="mt-6 font-display text-display-lg text-cream">How are you, actually?</h1>
        <p className="mt-5 max-w-[46ch] text-[1.0625rem] leading-[1.7] text-ash">
          I read you, you correct me, we find something that helps.
        </p>
        <p className="mt-3 font-mono text-[0.68rem] text-ash/50">
          Wellness tool · not medical advice
        </p>
      </header>

      {error && (
        <div className="relative z-10 mb-8 rounded-xl border border-signal-risk/30 bg-signal-risk/[0.08] px-4 py-3 text-sm text-signal-risk">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {stage === 'capture' && (
          <Fade key="capture">
            <CaptureStep capabilities={history?.capabilities} busy={busy} onSubmit={submit} />
          </Fade>
        )}

        {stage === 'confirm' && reading && (
          <Fade key="confirm">
            <ConfirmStep
              reading={reading}
              onAccept={() => setStage('suggest')}
              onCorrect={(mood) => submit({ source: 'manual', mood }, 'manual')}
              onBack={reset}
              busy={busy}
            />
          </Fade>
        )}

        {stage === 'suggest' && reading && (
          <Fade key="suggest">
            <SuggestStep reading={reading} onRestart={reset} onLogged={refreshHistory} />
          </Fade>
        )}

        {stage === 'support' && support && (
          <Fade key="support">
            <SupportStep support={support} onRestart={reset} />
          </Fade>
        )}
      </AnimatePresence>

      {history && <HistoryPanel history={history} />}
    </div>
  );
}

function Fade({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────── Capture ─────────────────────────── */

function CaptureStep({
  capabilities,
  busy,
  onSubmit,
}: {
  capabilities?: History['capabilities'];
  busy: string | null;
  onSubmit: (payload: Record<string, unknown>, label: string) => void;
}) {
  const [mode, setMode] = useState<'none' | 'camera' | 'voice'>('none');

  return (
    <div className="relative z-10 grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
      <div className="panel p-6">
        <Camera className="h-5 w-5 text-gold" />
        <h2 className="mt-4 font-display text-xl text-cream">Show me</h2>
        <p className="mt-2 text-sm leading-relaxed text-ash">
          One frame from your camera. It is read and thrown away — never saved, never sent
          anywhere but the model.
        </p>
        {capabilities && !capabilities.camera ? (
          <p className="mt-5 font-mono text-xs text-ash/60">No vision model configured.</p>
        ) : mode === 'camera' ? (
          <CameraCapture
            busy={busy === 'camera'}
            onCancel={() => setMode('none')}
            onCapture={(media, mimeType) => onSubmit({ source: 'camera', media, mimeType }, 'camera')}
          />
        ) : (
          <button
            onClick={() => setMode('camera')}
            className="mt-5 w-full rounded-xl border border-gold/35 bg-gold/[0.07] py-2.5 text-sm text-gold transition-colors hover:bg-gold/15"
          >
            Open camera
          </button>
        )}
      </div>

      <div className="panel p-6">
        <Mic className="h-5 w-5 text-gold" />
        <h2 className="mt-4 font-display text-xl text-cream">Say a few words</h2>
        <p className="mt-2 text-sm leading-relaxed text-ash">
          Ten seconds about your day. Tone and pace are the signal, not the words. Also discarded
          straight after.
        </p>
        {capabilities && !capabilities.voice ? (
          <p className="mt-5 font-mono text-xs text-ash/60">Voice needs a Gemini key.</p>
        ) : mode === 'voice' ? (
          <VoiceCapture
            busy={busy === 'voice'}
            onCancel={() => setMode('none')}
            onCapture={(media, mimeType) => onSubmit({ source: 'voice', media, mimeType }, 'voice')}
          />
        ) : (
          <button
            onClick={() => setMode('voice')}
            className="mt-5 w-full rounded-xl border border-gold/35 bg-gold/[0.07] py-2.5 text-sm text-gold transition-colors hover:bg-gold/15"
          >
            Start recording
          </button>
        )}
      </div>

      {/* Always available. Not everyone wants a camera on, and a demo machine
          may have neither camera nor microphone. */}
      <div className="panel p-6">
        <Check className="h-5 w-5 text-gold" />
        <h2 className="mt-4 font-display text-xl text-cream">Just tell me</h2>
        <p className="mt-2 text-sm leading-relaxed text-ash">
          No camera, no microphone, no guessing. Pick the closest one.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {MOOD_KEYS.map((m) => (
            <button
              key={m}
              disabled={Boolean(busy)}
              onClick={() => onSubmit({ source: 'manual', mood: m }, 'manual')}
              className="rounded-full border border-cream/12 px-3.5 py-1.5 text-xs text-ash transition-colors hover:border-gold/40 hover:text-cream disabled:opacity-40"
            >
              {MOODS[m].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CameraCapture({
  busy,
  onCapture,
  onCancel,
}: {
  busy: boolean;
  onCapture: (base64: string, mimeType: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch((err: DOMException) => {
        setDenied(
          err.name === 'NotAllowedError'
            ? 'Camera permission was refused. Allow it in the address bar, or use one of the other two options.'
            : 'No camera was found on this device.',
        );
      });

    // Leaving the camera light on after the user moves away is unacceptable.
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const shoot = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // 0.72 keeps the payload small enough to post quickly and is plenty for a
    // coarse read of expression.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);

    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(dataUrl, 'image/jpeg');
  };

  if (denied) {
    return (
      <div className="mt-5">
        <p className="text-xs leading-relaxed text-signal-risk">{denied}</p>
        <button onClick={onCancel} className="mt-3 text-xs text-ash underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="relative overflow-hidden rounded-xl border border-gold/25 bg-ink">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-[4/3] w-full scale-x-[-1] object-cover"
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="h-4 w-4 animate-spin text-gold" />
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={shoot}
          disabled={!ready || busy}
          className="flex-1 rounded-xl bg-gold py-2.5 text-sm font-medium text-ink disabled:opacity-40"
        >
          {busy ? 'Reading…' : 'Capture'}
        </button>
        <button onClick={onCancel} className="rounded-xl border border-cream/12 px-4 text-sm text-ash">
          Cancel
        </button>
      </div>
    </div>
  );
}

const RECORD_SECONDS = 10;

function VoiceCapture({
  busy,
  onCapture,
  onCancel,
}: {
  busy: boolean;
  onCapture: (base64: string, mimeType: string) => void;
  onCancel: () => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(RECORD_SECONDS);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.state === 'recording' && recorderRef.current.stop();
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Browsers disagree about what they will record. Pick the first one this
      // browser admits to supporting rather than assuming webm/opus.
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunks.current = [];

      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: recorder.mimeType || 'audio/webm' });
        const base64 = await blobToBase64(blob);
        onCapture(base64, (recorder.mimeType || 'audio/webm').split(';')[0]);
      };

      recorder.start();
      setRecording(true);
      setLeft(RECORD_SECONDS);
    } catch {
      setDenied('Microphone permission was refused. Use the camera, or just tell me how you feel.');
    }
  };

  useEffect(() => {
    if (!recording) return;
    if (left <= 0) {
      stop();
      setRecording(false);
      return;
    }
    const id = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [recording, left, stop]);

  if (denied) {
    return (
      <div className="mt-5">
        <p className="text-xs leading-relaxed text-signal-risk">{denied}</p>
        <button onClick={onCancel} className="mt-3 text-xs text-ash underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5">
      {recording ? (
        <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-5 text-center">
          <div className="font-display text-3xl text-gold">{left}</div>
          <p className="mt-2 text-xs text-ash">Talk about your day. Anything.</p>
          <button
            onClick={() => {
              stop();
              setRecording(false);
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-cream/12 px-3 py-1.5 text-xs text-ash"
          >
            <Square className="h-3 w-3" /> Stop now
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={start}
            disabled={busy}
            className="flex-1 rounded-xl bg-gold py-2.5 text-sm font-medium text-ink disabled:opacity-40"
          >
            {busy ? 'Listening…' : `Record ${RECORD_SECONDS}s`}
          </button>
          <button onClick={onCancel} className="rounded-xl border border-cream/12 px-4 text-sm text-ash">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the recording.'));
    reader.readAsDataURL(blob);
  });
}

/* ─────────────────────────── Confirm ─────────────────────────── */

function ConfirmStep({
  reading,
  onAccept,
  onCorrect,
  onBack,
  busy,
}: {
  reading: Reading;
  onAccept: () => void;
  onCorrect: (mood: Mood) => void;
  onBack: () => void;
  busy: string | null;
}) {
  const [correcting, setCorrecting] = useState(false);

  return (
    <div className="panel relative z-10 mx-auto max-w-2xl p-5 sm:p-7">
      {/* A wrong read should cost one tap to redo, not a page reload. */}
      <div className="flex items-center justify-between gap-4">
        <span className="eyebrow">My guess</span>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-ash transition-colors hover:text-gold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Try another way
        </button>
      </div>
      <h2 className="mt-5 font-display text-3xl text-cream">{reading.label}</h2>
      <p className="mt-3 text-[1.0625rem] leading-[1.7] text-ash">{reading.observation}</p>

      <div className="mt-5 flex items-center gap-2.5">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-cream/10">
          <div className="h-full bg-gold" style={{ width: `${Math.round(reading.confidence * 100)}%` }} />
        </div>
        <span className="font-mono text-[0.65rem] text-ash/60">
          {Math.round(reading.confidence * 100)}% sure — a face is not a feeling
        </span>
      </div>

      <p className="mt-6 text-sm text-cream/90">{reading.question}</p>

      {correcting ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {MOOD_KEYS.map((m) => (
            <button
              key={m}
              disabled={Boolean(busy)}
              onClick={() => onCorrect(m)}
              className="rounded-full border border-cream/12 px-3.5 py-1.5 text-xs text-ash transition-colors hover:border-gold/40 hover:text-cream disabled:opacity-40"
            >
              {MOODS[m].label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={onAccept}
            className="rounded-full bg-gold px-6 py-2.5 text-sm font-medium text-ink"
          >
            That is about right
          </button>
          <button
            onClick={() => setCorrecting(true)}
            className="rounded-full border border-cream/15 px-6 py-2.5 text-sm text-ash transition-colors hover:text-cream"
          >
            No — let me pick
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Suggest ─────────────────────────── */

function SuggestStep({
  reading,
  onRestart,
  onLogged,
}: {
  reading: Reading;
  onRestart: () => void;
  onLogged: () => void;
}) {
  const [suggestion, setSuggestion] = useState<Suggestion>(reading.suggestion);
  const [open, setOpen] = useState<string | null>(suggestion.techniques[0]?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const report = async (technique: Technique, helped: boolean) => {
    setSending(true);
    try {
      const res = await fetch('/api/mood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: { checkInId: reading.checkInId, techniqueId: technique.id, helped },
        }),
      });
      const data = await res.json();
      setMessage(data.message ?? null);
      if (data.next) {
        setSuggestion(data.next as Suggestion);
        setOpen((data.next as Suggestion).techniques[0]?.id ?? null);
      }
      onLogged();
    } catch {
      setMessage('That did not save. It is fine — carry on.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative z-10 space-y-8 lg:max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <span className="eyebrow">Try one of these</span>
          <p className="mt-3 text-[1.0625rem] text-ash">{suggestion.reading}</p>
        </div>
        <button
          onClick={onRestart}
          className="inline-flex items-center gap-2 text-xs text-ash transition-colors hover:text-gold"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Start over
        </button>
      </div>

      {message && (
        <p className="rounded-xl border border-gold/25 bg-gold/[0.06] px-4 py-3 text-sm text-cream/90">
          {message}
        </p>
      )}

      <div className="space-y-3">
        {suggestion.techniques.map((t) => (
          <TechniqueCard
            key={t.id}
            technique={t}
            open={open === t.id}
            onToggle={() => setOpen(open === t.id ? null : t.id)}
            onReport={report}
            sending={sending}
          />
        ))}
      </div>

      <SoundscapeDeck soundscapes={suggestion.soundscapes} />
    </div>
  );
}

function TechniqueCard({
  technique,
  open,
  onToggle,
  onReport,
  sending,
}: {
  technique: Technique;
  open: boolean;
  onToggle: () => void;
  onReport: (t: Technique, helped: boolean) => void;
  sending: boolean;
}) {
  return (
    <div className={cn('rounded-2xl border transition-colors', open ? 'border-gold/40 bg-gold/[0.05]' : 'border-cream/10')}>
      <button onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-cream">{technique.title}</h3>
          <p className="mt-1 text-sm text-ash">{technique.promise}</p>
        </div>
        <span className="shrink-0 font-mono text-[0.65rem] text-gold">{technique.minutes} min</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-5 px-5 pb-5">
              {technique.pacer && <BreathPacer pacer={technique.pacer} />}

              <ol className="space-y-2.5">
                {technique.steps.map((step, i) => (
                  <li key={step} className="flex gap-3 text-sm leading-relaxed text-cream/90">
                    <span className="mt-0.5 font-mono text-[0.65rem] text-gold">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>

              <div className="rounded-xl border border-cream/10 bg-ink/50 p-4">
                <span className="data-label">Why this works</span>
                <p className="mt-2 text-sm leading-relaxed text-ash">{technique.why}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-cream/8 pt-4">
                <span className="mr-2 text-sm text-ash">Did it help?</span>
                <button
                  disabled={sending}
                  onClick={() => onReport(technique, true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-xs font-medium text-ink disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" /> Yes
                </button>
                <button
                  disabled={sending}
                  onClick={() => onReport(technique, false)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cream/15 px-4 py-2 text-xs text-ash disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" /> Not really
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── Breathing pacer ─────────────────────────── */

/**
 * A circle that expands and contracts on the technique's own timing. Counting
 * in your head while anxious is exactly the thing that is hard, so the shape
 * does the counting.
 */
function BreathPacer({ pacer }: { pacer: NonNullable<Technique['pacer']> }) {
  const phases = [
    { key: 'Breathe in', seconds: pacer.inhale, scale: 1 },
    { key: 'Hold', seconds: pacer.hold, scale: 1 },
    { key: 'Breathe out', seconds: pacer.exhale, scale: 0.55 },
    { key: 'Hold', seconds: pacer.holdOut, scale: 0.55 },
  ].filter((p) => p.seconds > 0);

  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(phases[0].seconds);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (!running) return;
    if (left > 0) {
      const id = window.setTimeout(() => setLeft((n) => n - 1), 1000);
      return () => window.clearTimeout(id);
    }
    const next = (index + 1) % phases.length;
    if (next === 0) {
      if (cycle + 1 >= pacer.cycles) {
        setRunning(false);
        return;
      }
      setCycle((c) => c + 1);
    }
    setIndex(next);
    setLeft(phases[next].seconds);
  }, [running, left, index, cycle, phases, pacer.cycles]);

  const phase = phases[index];

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gold/20 bg-ink/40 p-4 sm:flex-nowrap sm:gap-6 sm:p-5">
      <motion.div
        animate={{ scale: running ? phase.scale : 0.75 }}
        transition={{ duration: running ? phase.seconds : 0.5, ease: 'easeInOut' }}
        className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-2 border-gold/50 bg-gold/10"
      >
        <span className="font-display text-xl text-gold">{running ? left : '—'}</span>
      </motion.div>

      <div className="min-w-0 flex-1">
        <p className="font-display text-lg text-cream">{running ? phase.key : 'Guided pacer'}</p>
        <p className="mt-1 text-xs text-ash">
          {running ? `Round ${cycle + 1} of ${pacer.cycles}` : `${pacer.cycles} rounds, follow the circle`}
        </p>
      </div>

      <button
        onClick={() => {
          if (running) {
            setRunning(false);
          } else {
            setIndex(0);
            setLeft(phases[0].seconds);
            setCycle(0);
            setRunning(true);
          }
        }}
        className="shrink-0 rounded-full border border-gold/40 p-2.5 text-gold"
        aria-label={running ? 'Stop pacer' : 'Start pacer'}
      >
        {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* ─────────────────────────── Soundscapes ─────────────────────────── */

/**
 * Every sound is synthesised in the browser with Web Audio. Nothing is
 * streamed and nothing is licensed, which means no copyright question and no
 * buffering on a bad connection — the two things that break an audio feature
 * during a live demo.
 */
function SoundscapeDeck({ soundscapes }: { soundscapes: Soundscape[] }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    stopRef.current?.();
    void ctxRef.current?.close();
  }, []);

  const toggle = async (scape: Soundscape) => {
    stopRef.current?.();
    stopRef.current = null;

    if (playing === scape.id) {
      setPlaying(null);
      return;
    }

    // Browsers only allow audio to start from a user gesture, which this is.
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    await ctxRef.current.resume();

    stopRef.current = startSoundscape(ctxRef.current, scape.recipe);
    setPlaying(scape.id);
  };

  return (
    <div>
      <span className="eyebrow">Something to listen to</span>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {soundscapes.map((s) => (
          <button
            key={s.id}
            onClick={() => toggle(s)}
            className={cn(
              'flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors',
              playing === s.id ? 'border-gold/45 bg-gold/[0.07]' : 'border-cream/10 hover:border-gold/30',
            )}
          >
            <span
              className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-full border',
                playing === s.id ? 'border-gold bg-gold text-ink' : 'border-gold/40 text-gold',
              )}
            >
              {playing === s.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-cream">{s.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ash">{s.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Returns a stop function. Each recipe is a small graph of noise and filters. */
function startSoundscape(ctx: AudioContext, recipe: Soundscape['recipe']): () => void {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 1.2);
  master.connect(ctx.destination);

  const nodes: Array<AudioScheduledSourceNode> = [];
  const timers: number[] = [];

  const noiseBuffer = (brown: boolean) => {
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        // Integrating white noise tilts the spectrum downward — the deep,
        // rumbling quality people mean when they say "brown noise".
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    nodes.push(src);
    return src;
  };

  if (recipe === 'brown-noise' || recipe === 'ocean') {
    const src = noiseBuffer(true);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = recipe === 'ocean' ? 500 : 900;
    src.connect(filter).connect(master);

    if (recipe === 'ocean') {
      // A slow swell, roughly the pace of calm breathing.
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 0.08;
      depth.gain.value = 0.12;
      lfo.connect(depth).connect(master.gain);
      lfo.start();
      nodes.push(lfo);
    }
    src.start();
  }

  if (recipe === 'rain') {
    const src = noiseBuffer(false);
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 700;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 6000;
    src.connect(high).connect(low).connect(master);
    src.start();
  }

  if (recipe === 'warm-hum') {
    [72, 108, 144].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = 0.14 / (i + 1);
      osc.connect(gain).connect(master);
      osc.start();
      nodes.push(osc);
    });
  }

  if (recipe === 'soft-chimes') {
    const pad = noiseBuffer(true);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    pad.connect(filter).connect(master);
    pad.start();

    // Pentatonic, so any two chimes that overlap still sound intentional.
    const notes = [523.25, 587.33, 698.46, 783.99, 880];
    const ring = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[Math.floor(Math.random() * notes.length)];
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.5);
      osc.connect(gain).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 3.6);
      timers.push(window.setTimeout(ring, 2500 + Math.random() * 4000));
    };
    timers.push(window.setTimeout(ring, 1200));
  }

  return () => {
    timers.forEach((t) => window.clearTimeout(t));
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    window.setTimeout(() => {
      nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      });
      master.disconnect();
    }, 500);
  };
}

/* ─────────────────────────── Support ─────────────────────────── */

function SupportStep({
  support,
  onRestart,
}: {
  support: { title: string; body: string; note: string };
  onRestart: () => void;
}) {
  return (
    <div className="panel panel-gold relative z-10 mx-auto max-w-2xl p-6 sm:p-8">
      <ShieldCheck className="h-6 w-6 text-gold" />
      <h2 className="mt-5 font-display text-2xl text-cream">{support.title}</h2>
      <p className="mt-4 text-[1.0625rem] leading-[1.75] text-cream/90">{support.body}</p>
      <p className="mt-6 border-t border-cream/10 pt-5 text-sm leading-relaxed text-ash">
        {support.note}
      </p>
      <button onClick={onRestart} className="mt-6 text-sm text-ash underline">
        Back
      </button>
    </div>
  );
}

/* ─────────────────────────── History ─────────────────────────── */

function HistoryPanel({ history }: { history: History }) {
  const checkIns = history.trend.reduce((n, p) => n + p.count, 0);

  return (
    <div className="relative z-10 mt-16 grid gap-10 border-t border-[var(--line)] pt-14 sm:mt-20 lg:max-w-3xl lg:grid-cols-1 xl:max-w-none xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      {true && (
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="eyebrow">Last fourteen days</span>
            <span className="font-mono text-[0.65rem] text-ash/50">
              {checkIns} {checkIns === 1 ? 'check-in' : 'check-ins'}
            </span>
          </div>
          <div className="mt-5 flex h-32 items-end gap-1.5">
            {history.trend.map((p) => {
              // −2…+2 mapped onto the bar height, with a floor so empty days
              // still show a tick rather than vanishing.
              const height = p.count === 0 ? 4 : Math.max(8, ((p.score + 2) / 4) * 100);
              return (
                <div key={p.day} className="group relative flex-1">
                  <div
                    className={cn(
                      'w-full rounded-sm transition-colors',
                      p.count === 0 ? 'bg-cream/8' : p.score >= 0 ? 'bg-gold' : 'bg-cocoa-soft',
                    )}
                    style={{ height: `${height}%` }}
                    title={`${p.day}: ${p.count === 0 ? 'no check-in' : p.score.toFixed(1)}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[0.6rem] text-ash/50">
            <span>14 days ago</span>
            <span>today</span>
          </div>

          {history.workload.message ? (
            <p className="mt-6 rounded-xl border border-gold/20 bg-gold/[0.05] p-4 text-sm leading-relaxed text-cream/90">
              {history.workload.message}
            </p>
          ) : (
            <p className="mt-6 text-sm leading-relaxed text-ash/70">
              {checkIns === 0
                ? 'Nothing logged yet. Your first check-in appears here as soon as you finish one.'
                : `Checking in on four separate days lets me compare your mood against how busy those days were. ${history.workload.daysCompared} so far.`}
            </p>
          )}
        </div>
      )}

      <div>
        <span className="eyebrow">What works for you</span>
        {history.worksForYou.length === 0 ? (
          <p className="mt-5 text-sm leading-relaxed text-ash/70">
            Once you have answered &ldquo;did it help?&rdquo; on the same technique twice, it gets
            ranked here — from your own answers, not from what usually works for people.
          </p>
        ) : (
          <>
          <ul className="mt-5 space-y-2.5">
            {history.worksForYou.map((w) => (
              <li key={w.techniqueId} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-cream/90">{w.title}</span>
                <span className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-cream/10">
                  <span className="block h-full bg-gold" style={{ width: `${w.rate * 100}%` }} />
                </span>
                <span className="shrink-0 font-mono text-[0.65rem] text-ash/60">
                  {w.helped}/{w.tried}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ash/60">
            Anything you say did not help stops being suggested first.
          </p>
          </>
        )}
      </div>
    </div>
  );
}
