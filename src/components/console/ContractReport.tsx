'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  FileText,
  Info,
  PenLine,
  ShieldQuestion,
  X,
} from 'lucide-react';
import {
  DOC_TYPE_LABEL,
  type ClauseFinding,
  type ContractReport as Report,
  type Severity,
} from '@/lib/agent/contracts';
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
  /** Hides the card from the stream. The document stays stored. */
  onDismiss?: () => void;
  compact?: boolean;
}

/**
 * The DOC module's output, in the order a reader needs it: what this is, what
 * it says, whether it wants a signature, the facts to remember. Clause risk
 * comes after, and only when the document is a contract — a date sheet gets
 * no verdict and no gauge, because it has nothing to sign.
 */
export function ContractReport({ report, pages, onDismiss, compact }: ContractReportProps) {
  const type = report.docType ?? 'contract';
  const isContract = type === 'contract';
  const highCount = report.findings.filter((f) => f.severity === 'high').length;
  const [showClauses, setShowClauses] = useState(isContract);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn('panel overflow-hidden', compact ? 'p-4' : 'p-5 sm:p-6')}
    >
      <header className="flex items-start gap-4 border-b border-cream/8 pb-5">
        {isContract && <RiskGauge score={report.riskScore} />}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <div className="min-w-0 flex-1">
              <span className="font-mono text-[0.62rem] text-gold">{DOC_TYPE_LABEL[type]}</span>
              <h3 className="mt-0.5 break-words text-sm font-medium text-cream">{report.title}</h3>
            </div>
            {onDismiss && (
              <button
                onClick={onDismiss}
                aria-label="Hide this card"
                title="Hide this card. The document stays stored."
                className="ml-auto shrink-0 rounded-md p-1 text-ash/45 transition-colors hover:bg-cream/5 hover:text-cream"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {report.summary ? (
            <p className="mt-2.5 text-sm leading-relaxed text-cream/85">{report.summary}</p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-cream/85">{report.verdict}</p>
          )}

          <p className="mt-2.5 font-mono text-[0.65rem] text-ash/55">
            {report.wordCount.toLocaleString()} words
            {pages ? ` · ${pages} ${pages === 1 ? 'page' : 'pages'}` : ''}
            {` · ${report.readingMinutes} min read`}
            {isContract && highCount > 0 ? ` · ${highCount} high severity` : ''}
            {' · stored'}
          </p>
        </div>
      </header>

      {typeof report.needsSignature === 'boolean' && (
        <div
          className={cn(
            'mt-4 flex gap-3 rounded-xl border p-3.5',
            report.needsSignature ? 'border-gold/30 bg-gold/[0.06]' : 'border-cream/10 bg-cream/[0.02]',
          )}
        >
          <PenLine className={cn('mt-0.5 h-4 w-4 shrink-0', report.needsSignature ? 'text-gold' : 'text-ash')} />
          <div className="min-w-0">
            <p className="text-xs font-medium text-cream">
              {report.needsSignature ? 'Needs your signature' : 'No signature needed'}
            </p>
            {report.signatureNote && <p className="mt-1 text-xs leading-relaxed text-ash">{report.signatureNote}</p>}
          </div>
        </div>
      )}

      {report.keyPoints && report.keyPoints.length > 0 && (
        <div className="mt-5">
          <span className="data-label">Worth remembering</span>
          <ul className="mt-2 space-y-1.5">
            {report.keyPoints.map((point) => (
              <li key={point} className="flex gap-2.5 text-xs leading-relaxed text-cream/85">
                <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isContract && report.summary && (
        <p className="mt-5 rounded-xl border border-cream/8 bg-ink/40 p-3.5 text-sm leading-relaxed text-cream/85">
          {report.verdict}
        </p>
      )}

      {isContract && report.parties.length > 0 && (
        <div className="mt-4">
          <span className="data-label">Between</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {report.parties.map((party) => (
              <span key={party} className="rounded-lg border border-cream/10 bg-cream/[0.03] px-2.5 py-1 text-xs text-ash">
                {party}
              </span>
            ))}
          </div>
        </div>
      )}

      {isContract && report.keyDates.length > 0 && (
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

      {(isContract || report.findings.length > 0) && (
        <div className="mt-5">
          {isContract ? (
            <span className="data-label">
              {report.findings.length > 0 ? `${report.findings.length} clauses flagged` : 'Nothing flagged'}
            </span>
          ) : (
            <button
              onClick={() => setShowClauses((v) => !v)}
              className="flex items-center gap-2 text-xs text-ash transition-colors hover:text-cream"
            >
              Also noticed {report.findings.length} clause-like {report.findings.length === 1 ? 'line' : 'lines'}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showClauses && 'rotate-180')} />
            </button>
          )}
          {(isContract || showClauses) && (
            <div className="mt-2.5 space-y-2">
              {report.findings.map((finding) => (
                <FindingRow key={finding.id} finding={finding} />
              ))}
              {isContract && report.findings.length === 0 && (
                <p className="text-xs leading-relaxed text-ash/70">
                  None of the known risk patterns matched. That is not the same as safe — read it
                  yourself, and send anything unusual back here.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {isContract && report.missing.length > 0 && (
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
        {isContract
          ? 'Pattern analysis, not legal advice. It catches known risky drafting; it cannot read intent or your commercial context. Have a lawyer look at anything that matters.'
          : 'Stored in your document library. Say "send the ' +
            firstWord(report.title) +
            ' pdf to <name>" to attach it to an email.'}
      </p>
    </motion.div>
  );
}

function firstWord(title: string) {
  return (
    title
      .toLowerCase()
      .match(/[\p{L}\d]{4,}/u)?.[0] ?? title.toLowerCase().split(/\s+/)[0]
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
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-ash/45 transition-transform duration-200', open && 'rotate-180')} />
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
        <p className="mt-0.5 font-mono text-[0.65rem] text-ash/55">Reading the document, then writing the summary</p>
      </div>
    </div>
  );
}
