'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, CheckCircle2, Inbox, Link2, ListChecks, Loader2, MailOpen, Trash2, Unlink } from 'lucide-react';
import { ApprovalCard } from '@/components/ui/ApprovalCard';
import { cn } from '@/lib/utils';
import type { ApprovalRequest, Commitment, StorageKind } from '@/types';

type Tab = 'approvals' | 'commitments';

interface GoogleStatus {
  connected: boolean;
  configured: boolean;
  email?: string | null;
  error?: string;
}

interface ReplyNotification {
  id?: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

interface SideRailProps {
  approvals: ApprovalRequest[];
  commitments: Commitment[];
  storage: StorageKind;
  onResolveApproval: (id: string, status: ApprovalRequest['status'], payload?: string) => void;
  onCommitmentState: (id: string, state: Commitment['state']) => void;
  onClearAll: () => void;
}

/**
 * The right-hand rail is where the agent's persisted state lives: what is
 * waiting on the user, and what has been promised. Both survive a reload,
 * which is the whole point of this phase.
 */
export function SideRail({
  approvals,
  commitments,
  storage,
  onResolveApproval,
  onCommitmentState,
  onClearAll,
}: SideRailProps) {
  const [tab, setTab] = useState<Tab>('approvals');
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [replies, setReplies] = useState<ReplyNotification[]>([]);
  const [readReplies, setReadReplies] = useState<string[]>([]);
  const pending = approvals.filter((a) => a.status === 'pending').length;
  const dueNow = commitments.filter((c) => c.state !== 'closed' && isDueNow(c.due, c.createdAt)).length;
  const replyTargets = Array.from(new Set(
    approvals
      .filter((a) => a.status === 'approved' || a.status === 'edited')
      .map((a) => a.target.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]?.toLowerCase())
      .filter((target): target is string => Boolean(target)),
  ));
  const unreadReplies = replies.filter((reply) => reply.id && !readReplies.includes(reply.id));

  useEffect(() => {
    fetch('/api/google', { cache: 'no-store' })
      .then((res) => res.json() as Promise<GoogleStatus>)
      .then(setGoogle)
      .catch(() => setGoogleError('Could not check Google connection.'));
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem('zyron-read-replies');
    if (stored) setReadReplies(JSON.parse(stored) as string[]);
  }, []);

  useEffect(() => {
    if (!google?.connected || replyTargets.length === 0) return;
    let cancelled = false;
    const checkReplies = async () => {
      const results = await Promise.all(
        replyTargets.map((target) => fetch(`/api/replies?from=${encodeURIComponent(target)}`, { cache: 'no-store' })
          .then((res) => res.ok ? res.json() as Promise<{ replies?: ReplyNotification[] }> : { replies: [] })
          .then((data) => data.replies ?? [])
          .catch(() => [])),
      );
      if (!cancelled) {
        const combined = results.flat().sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
        setReplies(combined);
      }
    };
    void checkReplies();
    const timer = window.setInterval(checkReplies, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [google?.connected, replyTargets.join(',')]);

  const markReplyRead = (id: string) => {
    const next = Array.from(new Set([...readReplies, id]));
    setReadReplies(next);
    window.localStorage.setItem('zyron-read-replies', JSON.stringify(next));
  };

  const disconnectGoogle = async () => {
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      const res = await fetch('/api/google', { method: 'DELETE' });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not disconnect Google.');
      setGoogle((current) => (current ? { ...current, connected: false, email: null } : current));
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : 'Could not disconnect Google.');
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/8 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-ash/45">Google workspace</p>
            <p className="mt-1 truncate text-xs text-cream/75">
              {!google ? 'Checking connection...' : !google.configured ? 'OAuth is not configured' : google.connected ? google.email ?? 'Connected' : 'Not connected'}
            </p>
          </div>
          {!google || googleBusy ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ash/50" />
          ) : google.connected ? (
            <button
              onClick={disconnectGoogle}
              title="Disconnect Google"
              className="rounded-lg p-2 text-ash/50 transition-colors hover:bg-white/5 hover:text-signal-risk"
            >
              <Unlink className="h-4 w-4" />
            </button>
          ) : google.configured ? (
            <a
              href="/api/google?connect=1"
              className="flex items-center gap-1.5 rounded-lg border border-gold/30 px-2.5 py-1.5 text-xs text-gold transition-colors hover:bg-gold/10"
            >
              <Link2 className="h-3.5 w-3.5" />
              Connect
            </a>
          ) : null}
        </div>
        {googleError && <p className="mt-2 text-[0.68rem] text-signal-risk">{googleError}</p>}
      </div>
      <div className="flex items-center gap-1 border-b border-white/8 p-2">
        <RailTab active={tab === 'approvals'} onClick={() => setTab('approvals')} count={pending}>
          Approvals
        </RailTab>
        <RailTab active={tab === 'commitments'} onClick={() => setTab('commitments')} count={dueNow}>
          Commitments
        </RailTab>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {tab === 'approvals' ? (
            <motion.div
              key="approvals"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {approvals.length === 0 ? (
                <Empty
                  icon={<Inbox className="h-5 w-5 text-ash/30" />}
                  text="Nothing is waiting on you. Ask ZYRON to send, book or cancel something and it will queue here first."
                />
              ) : (
                approvals.map((approval) => (
                  <ApprovalCard
                    key={approval.id}
                    request={approval}
                    onResolve={onResolveApproval}
                    compact
                  />
                ))
              )}
            </motion.div>
          ) : (
            <motion.div
              key="commitments"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-2"
            >
              {unreadReplies.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-gold">New replies</p>
                  {unreadReplies.map((reply) => (
                    <div key={reply.id} className="rounded-xl border border-gold/25 bg-gold/[0.06] p-3">
                      <div className="flex items-start gap-2">
                        <MailOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-cream">{reply.from}</p>
                          <p className="mt-1 text-xs text-cream/90">{reply.subject}</p>
                          <p className="mt-1 line-clamp-3 text-[0.68rem] leading-relaxed text-ash">{reply.snippet}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => reply.id && markReplyRead(reply.id)}
                        className="mt-2 ml-5 font-mono text-[0.62rem] text-gold hover:text-cream"
                      >
                        Mark as read
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {commitments.length === 0 ? (
                <Empty
                  icon={<ListChecks className="h-5 w-5 text-ash/30" />}
                  text={'Say something like "I\'ll send the deck by Tuesday" and the tracker will pick it up on its own.'}
                />
              ) : (
                commitments.map((c) => (
                  <CommitmentRow key={c.id} commitment={c} onState={onCommitmentState} />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/8 px-4 py-3">
        <span className="font-mono text-[0.62rem] text-ash/45">
          {storage === 'mongo' ? 'MongoDB connected' : 'In-memory session'}
        </span>
        <button
          onClick={onClearAll}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[0.62rem] text-ash/45 transition-colors hover:bg-signal-risk/10 hover:text-signal-risk"
        >
          <Trash2 className="h-3 w-3" />
          Delete everything
        </button>
      </div>
    </div>
  );
}

function RailTab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors',
        active ? 'bg-white/[0.06] text-cream' : 'text-ash/60 hover:text-cream',
      )}
    >
      {children}
      {count > 0 && (
        <span className="rounded-full bg-gold/18 px-1.5 py-0.5 font-mono text-[0.6rem] text-gold">
          {count}
        </span>
      )}
    </button>
  );
}

function CommitmentRow({
  commitment,
  onState,
}: {
  commitment: Commitment;
  onState: (id: string, state: Commitment['state']) => void;
}) {
  const closed = commitment.state === 'closed';

  return (
    <motion.div
      layout
      className={cn(
        'rounded-xl border border-white/10 bg-white/[0.02] p-3',
        closed && 'opacity-50',
      )}
    >
      <p className={cn('text-xs leading-relaxed text-cream/90', closed && 'line-through')}>
        {commitment.text}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-[0.6rem] text-ash/50">{commitment.owner}</span>
        {commitment.due && (
          <span className="rounded-md bg-gold/12 px-1.5 py-0.5 font-mono text-[0.6rem] text-gold">
            {commitment.due}
          </span>
        )}
        {!closed && isDueNow(commitment.due, commitment.createdAt) && (
          <span className="rounded-md bg-signal-risk/12 px-1.5 py-0.5 font-mono text-[0.6rem] text-signal-risk">
            Due now
          </span>
        )}
        {commitment.state === 'nudged' && (
          <span className="font-mono text-[0.6rem] text-cocoa-soft">nudged</span>
        )}

        {!closed && (
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => onState(commitment.id, 'nudged')}
              title="Send a nudge"
              className="rounded-md p-1 text-ash/45 transition-colors hover:bg-white/5 hover:text-gold"
            >
              <BellRing className="h-3 w-3" />
            </button>
            <button
              onClick={() => onState(commitment.id, 'closed')}
              title="Mark done"
              className="rounded-md p-1 text-ash/45 transition-colors hover:bg-white/5 hover:text-signal-ok"
            >
              <CheckCircle2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function isDueNow(due: string | null, createdAt: number): boolean {
  if (!due) return false;
  const value = due.toLowerCase();
  if (/today|tonight|end of day|eod/.test(value)) return true;
  if (value === 'tomorrow' || value === 'tomorow' || value === 'kal') {
    const created = new Date(createdAt);
    const today = new Date();
    const dueDate = new Date(created.getFullYear(), created.getMonth(), created.getDate() + 1);
    return today >= dueDate;
  }
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return weekdays.indexOf(value) === new Date().getDay();
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      {icon}
      <p className="text-xs leading-relaxed text-ash/50">{text}</p>
    </div>
  );
}
