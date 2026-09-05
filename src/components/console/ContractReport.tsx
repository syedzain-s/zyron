'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  FileText,
  Info,
  ShieldQuestion,
  Trash2,
} from 'lucide-react';
import type { ClauseFinding, ContractReport as Report, Severity } from '@/lib/agent/contracts';
import { cn } from '@/lib/utils';

const SEVERITY: Record<Severity, { label: string; text: string; border: string; dot: string }> = {
  high: { label: 'High', text: 'text-signal-risk', border: 'border-signal-risk/30', dot: 'bg-signal-risk' },
  medium: { label: 'Medium', text: 'text-gold', border: 'border-gold/30', dot: 'bg-gold' },
  low: { label: 'Low', text: 'text-cocoa-soft', border: 'border-cocoa/40', dot: 'bg-cocoa-soft' },
  info: { label: 'Note', text: 'text-ash', border: 'border-cream/12', dot: 'bg-ash' },
};

interface ContractReportProps {
  report: Report;
  pages?: number;
  onDismiss?: () => void;
  compact?: boolean;
}

/**
 * The DOC module's output. Ordered by what someone about to sign actually
 * needs: the verdict first, then what is wrong, then the dates that will bite,
 * then what the contract is missing. The score is deliberately not the hero —
 * a number invites arguing about the number instead of reading the clauses.
 */
export function ContractReport({ report, pages, onDismiss, compact }: ContractReportProps) {
  const highCount = report.findings.filter((f) => f.severity === 'high').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn('panel overflow-hidden', compact ? 'p-4' : 'p-5 sm:p-6')}
    >
      <header className="flex items-start gap-4 border-b border-cream/8 pb-5">
        <RiskGauge score={report.riskScore} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <h3 className="min-w-0 break-words text-sm font-medium text-cream">{report.title}</h3>
            {onDismiss && (
              <button
                onClick={onDismiss}
                aria-label="Remove this report"
                className="ml-auto shrink-0 rounded-md p-1 text-ash/45 transition-colors hover:bg-signal-risk/10 hover:text-signal-risk"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <p className="mt-2 text-sm leading-relaxed text-cream/85">{report.verdict}</p>

          <p className="mt-2.5 font-mono text-[0.65rem] text-ash/55">
            {report.wordCount.toLocaleString()} words
            {pages ? ` · ${pages} ${pages === 1 ? 'page' : 'pages'}` : ''}
            {` · ${report.readingMinutes} min read`}
            {highCount > 0 ? ` · ${highCount} high severity` : ''}
          </p>
        </div>
      </header>

      {report.parties.length > 0 && (
        <div className="mt-4">
          <span className="data-label">Between</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {report.parties.map((party) => (
              <span
                key={party}
                className="rounded-lg border border-cream/10 bg-cream/[0.03] px-2.5 py-1 text-xs text-ash"
              >
                {party}
              </span>
            ))}
          </div>
        </div>
      )}

      {report.keyDates.length > 0 && (
        <div className="mt-5">
          <span className="data-label">Dates that will bite</span>
          <ul className="mt-2 space-y-1.5">
            {report.keyDates.map((date) => (
              <li key={date.label} className="flex items-center gap-2.5 text-xs">
                <CalendarClock className="h-3.5 w-3.5 shrink-0 text-gold" />
                <span className="text-ash">{date.label}</span>
                <span className="ml-auto font-mono text-cream/90">{date.raw}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <span className="data-label">
          {report.findings.length > 0
            ? `${report.findings.length} clauses flagged`
            : 'Nothing flagged'}
        </span>
        <div className="mt-2.5 space-y-2">
          {report.findings.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
          {report.findings.length === 0 && (
            <p className="text-xs leading-relaxed text-ash/70">
              None of the known risk patterns matched. That is not the same as safe — read it
              yourself, and send anything unusual back here.
            </p>
          )}
        </div>
      </div>

      {report.missing.length > 0 && (
        <div className="mt-5 rounded-xl border border-gold/20 bg-gold/[0.05] p-4">
          <div className="flex items-center gap-2">
            <ShieldQuestion className="h-3.5 w-3.5 text-gold" />
            <span className="text-xs font-medium text-cream">Protections that are not there</span>
          </div>
          <ul className="mt-2.5 space-y-1">
            {report.missing.map((item) => (
              <li key={item} className="text-xs leading-relaxed text-ash">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 border-t border-cream/8 pt-4 text-[0.68rem] leading-relaxed text-ash/50">
        Pattern analysis, not legal advice. It catches known risky drafting; it cannot read intent
        or your commercial context. Have a lawyer look at anything that matters.
      </p>
    </motion.div>
  );
}

function FindingRow({ finding }: { finding: ClauseFinding }) {
  const [open, setOpen] = useState(finding.severity === 'high');
  const tone = SEVERITY[finding.severity];

  return (
    <div className={cn('rounded-xl border bg-cream/[0.02]', tone.border)}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} />
        <span className="min-w-0 flex-1 text-xs text-cream/90">{finding.title}</span>
        <span className={cn('shrink-0 font-mono text-[0.6rem]', tone.text)}>{tone.label}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-ash/45 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3.5 pb-3.5">
              <p className="text-xs leading-relaxed text-ash">{finding.plain}</p>

              <div className="flex gap-2 rounded-lg border border-cream/8 bg-ink/50 p-2.5">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
                <p className="text-xs leading-relaxed text-cream/85">{finding.advice}</p>
              </div>

              <div>
                <span className="data-label">From the document</span>
                <p className="mt-1.5 border-l-2 border-cocoa pl-3 text-[0.7rem] italic leading-relaxed text-ash/75">
                  {finding.excerpt}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * A single arc rather than a full donut. The score is context for the verdict,
 * not the headline, so it stays small and quiet.
 */
function RiskGauge({ score }: { score: number }) {
  const radius = 22;
  const circumference = Math.PI * radius; // half circle
  const clamped = Math.max(0, Math.min(score, 100));
  const color = clamped >= 60 ? '#C0584A' : clamped >= 30 ? '#C8A44D' : '#7FA88C';

  return (
    <div className="relative shrink-0" style={{ width: 56, height: 44 }}>
      <svg viewBox="0 0 56 34" className="h-full w-full" aria-hidden="true">
        <path
          d={`M 6 28 A ${radius} ${radius} 0 0 1 50 28`}
          fill="none"
          stroke="rgba(247,242,232,0.10)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <motion.path
          d={`M 6 28 A ${radius} ${radius} 0 0 1 50 28`}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span className="font-display text-sm leading-none" style={{ color }}>
          {clamped}
        </span>
      </div>
    </div>
  );
}

/** Shown while the file is being parsed — parsing a long PDF is not instant. */
export function ContractReportSkeleton({ filename }: { filename: string }) {
  return (
    <div className="panel flex items-center gap-3 p-4">
      <Info className="h-4 w-4 shrink-0 animate-pulse text-gold" />
      <div className="min-w-0">
        <p className="truncate text-xs text-cream/90">{filename}</p>
        <p className="mt-0.5 font-mono text-[0.65rem] text-ash/55">
          Extracting text, then checking clauses
        </p>
      </div>
    </div>
  );
}
