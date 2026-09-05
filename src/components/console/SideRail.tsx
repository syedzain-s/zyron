'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, CheckCircle2, Inbox, ListChecks, Trash2 } from 'lucide-react';
import { ApprovalCard } from '@/components/ui/ApprovalCard';
import { cn } from '@/lib/utils';
import type { ApprovalRequest, Commitment, StorageKind } from '@/types';

type Tab = 'approvals' | 'commitments';

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
  const pending = approvals.filter((a) => a.status === 'pending').length;
  const open = commitments.filter((c) => c.state !== 'closed').length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-white/8 p-2">
        <RailTab active={tab === 'approvals'} onClick={() => setTab('approvals')} count={pending}>
          Approvals
        </RailTab>
        <RailTab active={tab === 'commitments'} onClick={() => setTab('commitments')} count={open}>
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

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      {icon}
      <p className="text-xs leading-relaxed text-ash/50">{text}</p>
    </div>
  );
}
