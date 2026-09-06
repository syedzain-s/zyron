'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowUp, Camera, Inbox, LayoutGrid, Loader2, PanelLeft, PanelLeftClose, Paperclip, Upload, X } from 'lucide-react';
import { SceneCanvas } from '@/components/three/SceneCanvas';
import { ZyronCore } from '@/components/three/ZyronCore';
import { ParticleField } from '@/components/three/ParticleField';
import { StageLights } from '@/components/three/StageLights';
import { ApprovalCard } from '@/components/ui/ApprovalCard';
import { ContractReport, ContractReportSkeleton } from './ContractReport';
import { SideRail } from './SideRail';
import { MODULES, getModule } from '@/lib/modules';
import { cn, shortId } from '@/lib/utils';
import type { ContractReport as Report } from '@/lib/agent/contracts';
import type { ApprovalRequest, Commitment, ConsoleMessage, StorageKind } from '@/types';

/**
 * A stream entry is a console message that may also carry a contract report.
 * Extending the type here rather than in `@/types` keeps the DOC module's
 * shape local to the surface that renders it.
 */
type StreamItem = ConsoleMessage & {
  report?: Report;
  pages?: number;
  documentId?: string;
};

const SUGGESTIONS = [
  'Brief me on today',
  'Reply to Alex and hold Thursday at 3',
  "I'll send the revised deck to Sara by Tuesday",
  'Which subscriptions am I paying for twice?',
];

const GREETING: StreamItem = {
  id: 'boot',
  speaker: 'zyron',
  body: 'Orchestrator online. Twenty-three modules mounted. Give me a command, or drop a contract anywhere on this window and I will read it before you sign it.',
  createdAt: Date.now(),
};

const ACCEPT = '.pdf,.txt,.md,application/pdf,text/plain';

export function ConsoleClient() {
  const [messages, setMessages] = useState<StreamItem[]>([GREETING]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [storage, setStorage] = useState<StorageKind>('memory');
  const [hydrated, setHydrated] = useState(false);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  /** Which panel is showing as a sheet on narrow screens. */
  const [sheet, setSheet] = useState<'modules' | 'queue' | null>(null);
  const [activeModules, setActiveModules] = useState<string[]>([]);

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pendingCount = approvals.filter((a) => a.status === 'pending').length;
  const intensity = busy || uploading ? 1 : pendingCount > 0 ? 0.6 : 0.28;

  /* Hydrate from storage on mount — this is what makes the console stateful. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [stateRes, docsRes] = await Promise.all([
          fetch('/api/state', { cache: 'no-store' }),
          fetch('/api/contracts', { cache: 'no-store' }),
        ]);
        const state = await stateRes.json();
        const docs = await docsRes.json().catch(() => ({ documents: [] }));
        if (cancelled) return;

        setStorage(state.storage ?? 'memory');
        setApprovals(state.approvals ?? []);
        setCommitments(state.commitments ?? []);

        const restored: StreamItem[] = (state.messages ?? []).map(
          (m: Record<string, unknown>) => ({
            id: m.id as string,
            speaker: m.speaker as ConsoleMessage['speaker'],
            body: m.body as string,
            routedTo: m.routedTo as string[] | undefined,
            createdAt: m.createdAt as number,
          }),
        );

        // Past reports rejoin the stream in the order they were filed.
        const reports: StreamItem[] = (docs.documents ?? []).map(
          (d: { id: string; report: Report; pages: number; createdAt: number }) => ({
            id: `doc-${d.id}`,
            speaker: 'zyron' as const,
            body: `DOC — ${d.report.title} analysed.`,
            routedTo: ['DOC'],
            report: d.report,
            pages: d.pages,
            documentId: d.id,
            createdAt: d.createdAt,
          }),
        );

        const merged = [...restored, ...reports].sort((a, b) => a.createdAt - b.createdAt);
        if (merged.length > 0) setMessages([GREETING, ...merged]);
      } catch {
        // Offline hydration failure is survivable — start from a clean console.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, uploading]);

  const pushSystem = useCallback((body: string) => {
    setMessages((prev) => [
      ...prev,
      { id: shortId(), speaker: 'system', body, createdAt: Date.now() },
    ]);
  }, []);

  /* ─────────────────────────── Commands ─────────────────────────── */

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busy) return;

      setMessages((prev) => [
        ...prev,
        { id: shortId(), speaker: 'user', body: text, createdAt: Date.now() },
      ]);
      setInput('');
      setBusy(true);

      try {
        const history = messages
          .filter((m) => m.speaker !== 'system')
          .slice(-8)
          .map((m) => ({
            role: m.speaker === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.body,
          }));

        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history }),
        });

        if (!res.ok) {
          const { error } = await res
            .json()
            .catch(() => ({ error: 'The console could not reach the orchestrator.' }));
          throw new Error(error);
        }

        const data = await res.json();
        setActiveModules(data.routedTo ?? []);
        if (data.storage) setStorage(data.storage);
        if (data.approval) setApprovals((prev) => [data.approval, ...prev]);
        if (Array.isArray(data.commitments) && data.commitments.length > 0) {
          setCommitments((prev) => [...data.commitments, ...prev]);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: shortId(),
            speaker: 'zyron',
            body: data.body,
            routedTo: data.routedTo,
            approval: data.approval ?? undefined,
            createdAt: Date.now(),
          },
        ]);
      } catch (error) {
        pushSystem(
          error instanceof Error
            ? `${error.message} Check the dev server is running, then send it again.`
            : 'The orchestrator did not respond. Send the command again.',
        );
      } finally {
        setBusy(false);
        window.setTimeout(() => setActiveModules([]), 2200);
        inputRef.current?.focus();
      }
    },
    [busy, input, messages, pushSystem],
  );

  /* ─────────────────────────── Documents ─────────────────────────── */

  const uploadFile = useCallback(
    async (file: File) => {
      if (uploading) return;
      setUploading(file.name);
      setActiveModules(['DOC']);

      const form = new FormData();
      form.append('file', file);

      try {
        const res = await fetch('/api/contracts', { method: 'POST', body: form });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.report) {
          // Extraction messages are written for the user and say what to do,
          // so they go through as-is.
          throw new Error(data?.error ?? 'That document could not be analysed.');
        }

        setMessages((prev) => [
          ...prev,
          {
            id: shortId(),
            speaker: 'zyron',
            body: `DOC — ${data.report.title} analysed.`,
            routedTo: ['DOC'],
            report: data.report as Report,
            pages: data.pages,
            documentId: data.id,
            createdAt: Date.now(),
          },
        ]);
        if (data.storage) setStorage(data.storage);
      } catch (error) {
        pushSystem(error instanceof Error ? error.message : 'That upload failed. Try again.');
      } finally {
        setUploading(null);
        window.setTimeout(() => setActiveModules([]), 2200);
      }
    },
    [uploading, pushSystem],
  );

  const removeDocument = useCallback(async (streamId: string, documentId?: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== streamId));
    if (documentId) {
      await fetch(`/api/contracts?id=${documentId}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }, []);

  /* Drag events fire for every child element, so depth is counted rather than
     toggled — otherwise the overlay flickers as the pointer crosses the UI. */
  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  };

  /* ─────────────────────────── Approvals ─────────────────────────── */

  const resolveApproval = useCallback(
    async (id: string, status: ApprovalRequest['status'], payload?: string) => {
      const previous = approvals;
      setApprovals((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status, payload: payload ?? a.payload } : a)),
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.approval?.id === id
            ? { ...m, approval: { ...m.approval, status, payload: payload ?? m.approval.payload } }
            : m,
        ),
      );

      try {
        const res = await fetch(`/api/approvals/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, payload }),
        });
        if (!res.ok) throw new Error('save failed');
      } catch {
        setApprovals(previous);
        pushSystem('That decision could not be saved, so nothing was dispatched. Try it again.');
      }
    },
    [approvals, pushSystem],
  );

  const setCommitmentState = useCallback(
    async (id: string, state: Commitment['state']) => {
      const previous = commitments;
      setCommitments((prev) => prev.map((c) => (c.id === id ? { ...c, state } : c)));
      try {
        const res = await fetch(`/api/commitments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state }),
        });
        if (!res.ok) throw new Error('save failed');
      } catch {
        setCommitments(previous);
      }
    },
    [commitments],
  );

  const clearAll = useCallback(async () => {
    if (!window.confirm('Delete every stored approval, commitment, document and message? This cannot be undone.')) {
      return;
    }
    try {
      await Promise.all([
        fetch('/api/state', { method: 'DELETE' }),
        fetch('/api/contracts?all=1', { method: 'DELETE' }),
      ]);
    } finally {
      setApprovals([]);
      setCommitments([]);
      setMessages([GREETING]);
    }
  }, []);

  const railModules = useMemo(() => MODULES, []);

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative flex h-[100svh] flex-col overflow-hidden bg-ink pt-[4.5rem]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <SceneCanvas label="console" lazy={false} camera={{ position: [0, 0, 8.4] }}>
          <StageLights env={false} />
          <ParticleField count={480} radius={15} parallax={0.22} />
          <ZyronCore intensity={intensity} scale={0.95} position={[3.4, 0.4, -2.4]} />
        </SceneCanvas>
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-4 z-40 grid place-items-center rounded-3xl border-2 border-dashed border-gold/50 bg-ink/85 backdrop-blur-sm"
          >
            <div className="text-center">
              <Upload className="mx-auto h-6 w-6 text-gold" />
              <p className="mt-4 font-display text-xl text-cream">Drop the contract</p>
              <p className="mt-2 font-mono text-xs text-ash">PDF or text, under 12MB</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex min-h-0 flex-1">
        {/* Module rail */}
        <AnimatePresence initial={false}>
          {railOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 268, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="hidden shrink-0 overflow-hidden border-r bg-ink/70 backdrop-blur-xl lg:block"
            >
              <div className="flex h-full w-[268px] flex-col">
                <div className="flex items-center justify-between px-5 py-4">
                  <span className="eyebrow">Modules</span>
                  <span className="font-mono text-[0.65rem] text-signal-ok">23 online</span>
                </div>

                <Link
                  href="/mood"
                  className="mx-2 mb-2 flex items-center gap-3 rounded-xl border border-gold/25 bg-gold/[0.06] px-3 py-2.5 text-xs text-gold transition-colors hover:bg-gold/12"
                >
                  <Camera className="h-3.5 w-3.5 shrink-0" />
                  Check in on yourself
                </Link>
                <ModuleList
                  modules={railModules}
                  active={activeModules}
                  onPick={(name) => send(`Run ${name} and report back.`)}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Command stream */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b px-5 py-3">
            <button
              onClick={() => setRailOpen((v) => !v)}
              className="hidden rounded-lg p-1.5 text-ash transition-colors hover:bg-cream/5 hover:text-cream lg:block"
              aria-label={railOpen ? 'Hide module rail' : 'Show module rail'}
            >
              {railOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
            <span className="text-sm text-cream">Command stream</span>

            {/* Below lg the module rail is gone; below xl the queue is too.
                These put both back within one tap instead of leaving the
                whole agent unreachable on a phone. */}
            <button
              onClick={() => setSheet('modules')}
              className="ml-2 rounded-lg p-1.5 text-ash transition-colors hover:text-gold lg:hidden"
              aria-label="Show modules"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSheet('queue')}
              className="relative rounded-lg p-1.5 text-ash transition-colors hover:text-gold xl:hidden"
              aria-label="Show approvals and commitments"
            >
              <Inbox className="h-4 w-4" />
              {pendingCount > 0 && (
                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-gold" />
              )}
            </button>

            <span className="ml-auto flex items-center gap-2 font-mono text-[0.68rem] text-ash">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  busy || uploading ? 'animate-pulse bg-gold' : hydrated ? 'bg-signal-ok' : 'bg-ash/40',
                )}
              />
              {uploading ? 'Reading document' : busy ? 'Processing' : hydrated ? 'Idle' : 'Restoring'}
            </span>
          </div>

          <div ref={streamRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-8">
            <div className="mx-auto max-w-2xl space-y-6">
              {messages.map((msg) => (
                <MessageRow
                  key={msg.id}
                  message={msg}
                  onResolve={resolveApproval}
                  onRemoveDocument={removeDocument}
                />
              ))}

              {uploading && <ContractReportSkeleton filename={uploading} />}

              {busy && (
                <div className="flex items-center gap-2.5 font-mono text-xs text-ash">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
                  Routing through the orchestrator
                </div>
              )}

              {messages.length <= 1 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border px-3.5 py-1.5 text-xs text-ash transition-colors hover:border-gold/40 hover:text-cream"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div className="border-t bg-ink/80 px-5 py-4 backdrop-blur-xl">
            <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border bg-cream/[0.03] p-2.5 focus-within:border-gold/40">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadFile(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={Boolean(uploading)}
                aria-label="Attach a contract"
                title="Attach a contract"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ash transition-colors hover:bg-cream/5 hover:text-gold disabled:opacity-30"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Tell ZYRON what to handle"
                className="max-h-40 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-cream outline-none placeholder:text-ash/50"
              />

              <button
                onClick={() => void send()}
                disabled={!input.trim() || busy}
                aria-label="Send command"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold text-ink transition-opacity disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
            <p className="mx-auto mt-2 max-w-2xl font-mono text-[0.65rem] text-ash/45">
              Enter to send · Shift+Enter for a new line · drop a contract anywhere
            </p>
          </div>
        </main>

        <aside className="hidden w-[330px] shrink-0 border-l bg-ink/70 backdrop-blur-xl xl:block">
          <SideRail
            approvals={approvals}
            commitments={commitments}
            storage={storage}
            onResolveApproval={resolveApproval}
            onCommitmentState={setCommitmentState}
            onClearAll={clearAll}
          />
        </aside>
      </div>

      {/* Slide-over for narrow screens. Same components as the desktop rails,
          so there is one implementation to keep correct. */}
      <AnimatePresence>
        {sheet && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheet(null)}
              aria-label="Close panel"
              className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 right-0 z-50 flex w-[min(22rem,88vw)] flex-col border-l bg-ink"
            >
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="eyebrow">{sheet === 'modules' ? 'Modules' : 'Waiting on you'}</span>
                <button
                  onClick={() => setSheet(null)}
                  className="rounded-lg p-1.5 text-ash hover:text-cream"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {sheet === 'modules' ? (
                <ModuleList
                  modules={railModules}
                  active={activeModules}
                  onPick={(name) => {
                    setSheet(null);
                    send(`Run ${name} and report back.`);
                  }}
                />
              ) : (
                <SideRail
                  approvals={approvals}
                  commitments={commitments}
                  storage={storage}
                  onResolveApproval={resolveApproval}
                  onCommitmentState={setCommitmentState}
                  onClearAll={clearAll}
                />
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModuleList({
  modules,
  active,
  onPick,
}: {
  modules: typeof MODULES;
  active: string[];
  onPick: (name: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
      {modules.map((mod) => {
        const lit = active.includes(mod.code);
        return (
          <button
            key={mod.code}
            onClick={() => onPick(mod.name)}
            className={cn(
              'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
              lit ? 'bg-gold/12' : 'hover:bg-cream/[0.04]',
            )}
          >
            <mod.icon
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-colors',
                lit ? 'text-gold' : 'text-ash/60 group-hover:text-ash',
              )}
            />
            <span
              className={cn(
                'truncate text-xs transition-colors',
                lit ? 'text-cream' : 'text-ash group-hover:text-cream',
              )}
            >
              {mod.name}
            </span>
            <span className="ml-auto font-mono text-[0.6rem] text-ash/40">{mod.code}</span>
          </button>
        );
      })}
    </div>
  );
}

function MessageRow({
  message,
  onResolve,
  onRemoveDocument,
}: {
  message: StreamItem;
  onResolve: (id: string, status: ApprovalRequest['status'], payload?: string) => void;
  onRemoveDocument: (streamId: string, documentId?: string) => void;
}) {
  if (message.speaker === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <p className="max-w-[85%] rounded-2xl rounded-br-md border border-gold/20 bg-gold/[0.07] px-4 py-3 text-sm leading-relaxed text-cream">
          {message.body}
        </p>
      </motion.div>
    );
  }

  if (message.speaker === 'system') {
    return (
      <p className="rounded-xl border border-signal-risk/25 bg-signal-risk/[0.08] px-4 py-3 text-xs leading-relaxed text-signal-risk">
        {message.body}
      </p>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      {message.routedTo && message.routedTo.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {message.routedTo.map((code) => {
            const mod = getModule(code);
            if (!mod) return null;
            return (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-cream/[0.03] px-2 py-1 font-mono text-[0.62rem] text-ash"
              >
                <mod.icon className="h-3 w-3 text-gold" />
                {mod.code}
              </span>
            );
          })}
        </div>
      )}

      {/* A report replaces the prose rather than sitting under it — the card
          already says everything the sentence would. */}
      {message.report ? (
        <ContractReport
          report={message.report}
          pages={message.pages}
          onDismiss={() => onRemoveDocument(message.id, message.documentId)}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-cream/90">{message.body}</p>
      )}

      {message.approval && (
        <div className="pt-1 xl:hidden">
          <ApprovalCard request={message.approval} onResolve={onResolve} compact />
        </div>
      )}
    </motion.div>
  );
}
