import Link from 'next/link';
import { ArrowLeft, CheckCircle2, FileText, Mail, Reply, ShieldAlert } from 'lucide-react';
import { getStore, DEFAULT_USER } from '@/lib/db/store';
import { recentInbox } from '@/lib/connectors/google';

export const dynamic = 'force-dynamic';

export default async function RecordsPage() {
  const store = getStore();
  const [approvals, events, inbox] = await Promise.all([
    store.listApprovals(DEFAULT_USER, 100),
    store.listEvents(DEFAULT_USER, 100),
    recentInbox(30).catch(() => []),
  ]);
  const sent = approvals.filter((approval) => approval.status === 'approved' || approval.status === 'edited');

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-ink px-5 pb-16 pt-32 text-cream sm:px-10">
      <div className="mx-auto w-full min-w-0 max-w-6xl">
        <Link href="/console" className="mb-8 inline-flex items-center gap-2 text-sm text-ash hover:text-cream">
          <ArrowLeft className="h-4 w-4" /> Back to command stream
        </Link>
        <div className="mb-10 flex flex-col items-start justify-between gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold">Records</p>
            <h1 className="mt-3 max-w-full break-words font-display text-3xl sm:text-4xl">What ZYRON sent and what came back</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ash">Sent emails, PDF attachments, delivery outcomes, audit events, and readable inbox replies in one place.</p>
          </div>
          <span className="shrink-0 font-mono text-xs text-ash/60">{sent.length} sent actions</span>
        </div>

        <section className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0 space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-gold">Sent records</h2>
            {sent.length === 0 ? <Empty text="No approved messages have been sent yet." /> : sent.map((approval) => (
              <article key={approval.id} className="panel p-5">
                <div className="flex items-start gap-3">
                  {approval.attachment ? <FileText className="mt-1 h-5 w-5 text-gold" /> : <Mail className="mt-1 h-5 w-5 text-gold" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-medium">{approval.action}</h3>
                      <span className={`inline-flex items-center gap-1 font-mono text-xs ${approval.deliveryChannel === 'simulated' ? 'text-signal-risk' : 'text-signal-ok'}`}><CheckCircle2 className="h-3.5 w-3.5" /> {approval.deliveryChannel === 'simulated' ? 'Not delivered' : approval.deliveryChannel ? 'Delivered' : 'Approved'}</span>
                    </div>
                    <p className="mt-2 text-sm text-ash">To: {approval.target}</p>
                    {approval.attachment && <p className="mt-1 text-sm text-gold">PDF: {approval.attachment.filename}</p>}
                    <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 font-sans text-sm leading-relaxed text-cream/80">{approval.payload}</pre>
                    <p className="mt-3 font-mono text-[0.65rem] text-ash/50">{new Date(approval.resolvedAt ?? approval.createdAt).toLocaleString()}</p>
                    {approval.deliveryDetail && <p className="mt-1 text-xs text-ash/70">{approval.deliveryDetail}</p>}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="min-w-0 space-y-8">
            <section>
              <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-gold">Inbox replies</h2>
              <div className="mt-4 space-y-3">
                {inbox.length === 0 ? <Empty text="No inbox messages available. Connect Google to read replies." /> : inbox.slice(0, 12).map((message) => (
                  <article key={message.id} className="panel p-4">
                    <div className="flex items-start gap-3">
                      <Reply className="mt-1 h-4 w-4 shrink-0 text-gold" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{message.from}</p>
                        <p className="mt-1 text-sm text-cream/80">{message.subject}</p>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ash">{message.body || message.snippet || 'No readable message body.'}</p>
                        <p className="mt-2 font-mono text-[0.62rem] text-ash/45">{message.receivedAt ? new Date(message.receivedAt).toLocaleString() : ''}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section>
              <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-gold">Audit trail</h2>
              <div className="mt-4 space-y-2">
                {events.slice(0, 12).map((event) => <p key={event.id} className="flex gap-2 text-xs text-ash"><ShieldAlert className="h-3.5 w-3.5 shrink-0 text-gold" />{event.summary}</p>)}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="panel p-5 text-sm text-ash/60">{text}</div>;
}