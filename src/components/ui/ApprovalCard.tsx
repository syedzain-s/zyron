'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Pencil, ShieldCheck, X } from 'lucide-react';
import type { ApprovalRequest } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from './Button';

const RISK_COPY: Record<ApprovalRequest['risk'], { label: string; tone: string }> = {
  autonomous: { label: 'Runs without you', tone: 'text-signal-ok border-signal-ok/30 bg-signal-ok/10' },
  approval: { label: 'Needs your approval', tone: 'text-gold border-gold/30 bg-gold/10' },
  sealed: { label: 'Sealed — dual confirm', tone: 'text-signal-risk border-signal-risk/30 bg-signal-risk/10' },
};

interface ApprovalCardProps {
  request: ApprovalRequest;
  onResolve?: (id: string, status: ApprovalRequest['status'], payload?: string) => void;
  compact?: boolean;
}

/**
 * Nothing leaves ZYRON without passing through this card. It is the single
 * most important control in the product, so it states the module, the exact
 * outside-world effect, the recipient and the literal payload before offering
 * a decision.
 */
export function ApprovalCard({ request, onResolve, compact }: ApprovalCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(request.payload);
  const risk = RISK_COPY[request.risk];
  const settled = request.status !== 'pending';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, rotateX: -8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'panel panel-gold preserve-3d overflow-hidden',
        compact ? 'p-4' : 'p-5 sm:p-6',
        settled && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 text-gold" />
          <span className="text-sm font-medium text-cream">Approval required</span>
        </div>
        <span className={cn('rounded-full border px-2.5 py-0.5 font-mono text-[0.65rem]', risk.tone)}>
          {risk.label}
        </span>
      </div>

      <dl className="mt-4 space-y-3 text-sm">
        <Row label="Module">
          <span className="font-mono text-xs text-cocoa-soft">{request.moduleCode}</span>
          <span className="ml-2 text-ash">{request.moduleName}</span>
        </Row>
        <Row label="Action">{request.action}</Row>
        <Row label="Goes to">{request.target}</Row>
      </dl>

      <div className="mt-4">
        <span className="data-label">Exact payload</span>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-gold/30 bg-ink/60 p-3 text-sm text-cream outline-none focus:border-gold"
          />
        ) : (
          <p className="mt-2 rounded-xl border border-white/10 bg-ink/50 p-3 text-sm leading-relaxed text-cream/90">
            {draft}
          </p>
        )}
      </div>

      {settled ? (
        <p className="mt-4 font-mono text-xs text-ash/70">
          {request.deliveryDetail ??
            (request.status === 'approved'
              ? 'Approved.'
              : request.status === 'edited'
                ? 'Edited and approved.'
                : 'Cancelled. Nothing was sent.')}
        </p>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={() => onResolve?.(request.id, editing ? 'edited' : 'approved', draft)}
            icon={<Check className="h-4 w-4" />}
            className="px-5 py-2.5"
          >
            {editing ? 'Save and send' : 'Approve and send'}
          </Button>
          {!editing && (
            <Button
              variant="ghost"
              onClick={() => setEditing(true)}
              icon={<Pencil className="h-3.5 w-3.5" />}
              className="px-5 py-2.5"
            >
              Edit draft
            </Button>
          )}
          <Button
            variant="danger"
            onClick={() => onResolve?.(request.id, 'cancelled')}
            icon={<X className="h-3.5 w-3.5" />}
            className="px-5 py-2.5"
          >
            Cancel
          </Button>
        </div>
      )}
    </motion.div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      <dt className="data-label w-24 shrink-0 pt-0.5">{label}</dt>
      <dd className="flex-1 text-cream/90">{children}</dd>
    </div>
  );
}
