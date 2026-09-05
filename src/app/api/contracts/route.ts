import { NextResponse } from 'next/server';
import { analyseContract } from '@/lib/agent/contracts';
import { ExtractionError, MAX_BYTES, extractDocument } from '@/lib/agent/documents';
import { DEFAULT_USER, getDocumentStore } from '@/lib/db/documents';
import { getStore } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Parsing a long contract is slower than a normal request. */
export const maxDuration = 60;

/**
 * DOC module — Contract Intelligence.
 *
 * POST   multipart form with `file`  → extract, analyse, store, return report
 * GET                                → the last 20 reports (no document text)
 * GET    ?id=…                       → one report, with its text
 * DELETE ?id=…                       → remove one report
 * DELETE ?all=1                      → remove every stored document
 */

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Send the file as multipart/form-data with a field named "file".' },
      { status: 415 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (error) {
    console.error('[zyron] form parse failed', error);
    return NextResponse.json(
      { error: 'That upload did not arrive intact. Try it again.' },
      { status: 400 },
    );
  }

  const entry = form.get('file');
  if (!entry || typeof entry === 'string') {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
  }

  const file = entry as File;

  // Check the declared size before reading the whole thing into memory.
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Keep uploads under 12MB.` },
      { status: 413 },
    );
  }

  const store = getStore();
  const documents = getDocumentStore();

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());

    const extracted = await extractDocument({ name: file.name, type: file.type, bytes });
    const report = analyseContract(extracted.text, extracted.title);

    const saved = await documents.create({
      userId: DEFAULT_USER,
      title: extracted.title,
      kind: extracted.kind,
      pages: extracted.pages,
      bytes: extracted.bytes,
      report,
      text: extracted.text,
      createdAt: Date.now(),
    });

    // Every analysis is an audited event, same as an approval decision.
    await store
      .appendEvent({
        userId: DEFAULT_USER,
        kind: 'document.analysed',
        summary: `DOC — ${report.title}: risk ${report.riskScore}, ${report.findings.length} findings`,
        detail: {
          documentId: saved.id,
          high: report.findings.filter((f) => f.severity === 'high').length,
        },
        at: Date.now(),
      })
      .catch((error) => console.error('[zyron] audit write failed', error));

    return NextResponse.json({
      id: saved.id,
      report,
      pages: extracted.pages,
      storage: documents.kind,
    });
  } catch (error) {
    // Extraction failures are the user's to act on, so the message goes
    // through verbatim. Everything else is ours and stays generic.
    if (error instanceof ExtractionError) {
      console.warn('[zyron] extraction rejected', error.userMessage, error.reason);
      return NextResponse.json({ error: error.userMessage }, { status: 422 });
    }

    console.error('[zyron] contract analysis failed', error);
    return NextResponse.json(
      { error: 'The document could not be analysed. Try uploading it again.' },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  const documents = getDocumentStore();

  try {
    if (id) {
      const doc = await documents.get(DEFAULT_USER, id);
      if (!doc) {
        return NextResponse.json({ error: 'That document is not stored.' }, { status: 404 });
      }
      return NextResponse.json({ document: doc, storage: documents.kind });
    }

    const list = await documents.list(DEFAULT_USER);
    return NextResponse.json({ documents: list, storage: documents.kind });
  } catch (error) {
    console.error('[zyron] listing documents failed', error);
    return NextResponse.json(
      { documents: [], storage: documents.kind, error: 'Stored documents are unreachable right now.' },
      { status: 200 },
    );
  }
}

export async function DELETE(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  const all = params.get('all');
  const documents = getDocumentStore();

  try {
    if (all) {
      await documents.clear(DEFAULT_USER);
      return NextResponse.json({ cleared: true });
    }

    if (!id) {
      return NextResponse.json({ error: 'Pass ?id= or ?all=1.' }, { status: 400 });
    }

    const removed = await documents.remove(DEFAULT_USER, id);
    if (!removed) {
      return NextResponse.json({ error: 'That document is not stored.' }, { status: 404 });
    }
    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error('[zyron] deleting document failed', error);
    return NextResponse.json({ error: 'The document could not be removed.' }, { status: 503 });
  }
}
