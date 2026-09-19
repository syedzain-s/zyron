import { NextResponse } from 'next/server';
import { analyseDocument } from '@/lib/agent/contracts';
import { ExtractionError, MAX_BYTES, extractDocument } from '@/lib/agent/documents';
import { ModelError, readImage, visionAvailable } from '@/lib/agent/providers';
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
    const bytes = await readUploadBytes(file);
    // PDF.js may detach or consume the buffer it parses. Keep an untouched
    // copy for MongoDB and email attachments after analysis completes.
    const originalBytes = bytes.slice();

    let extracted;
    try {
      extracted = await extractDocument({ name: file.name, type: file.type, bytes: bytes.slice() });
    } catch (error) {
      const isScanned = error instanceof ExtractionError && error.userMessage.includes('scanned document');
      if (!isScanned || !visionAvailable()) throw error;

      // A scanned PDF has no text layer. Render each page as PNG first: the
      // vision path accepts images, while this Gemini model rejects inline PDF.
      const { text: ocr, pages: scannedPages } = await ocrScannedPdf(originalBytes.slice());
      if (ocr.trim().length < 80) throw error;
      extracted = {
        title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled document',
        kind: 'pdf' as const,
        text: ocr.trim(),
        pages: scannedPages,
        bytes: bytes.byteLength,
      };
    }
    const report = await analyseDocument(extracted.text, extracted.title);

    if (originalBytes.byteLength === 0) {
      throw new ExtractionError('The original PDF could not be retained. Upload the file again before storing it.');
    }

    const saved = await documents.create({
      userId: DEFAULT_USER,
      title: extracted.title,
      kind: extracted.kind,
      pages: extracted.pages,
      bytes: originalBytes.byteLength,
      report,
      text: extracted.text,
      contentBase64: Buffer.from(originalBytes).toString('base64'),
      mimeType: file.type || 'application/pdf',
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

    if (error instanceof ModelError) {
      console.warn('[zyron] scanned PDF OCR unavailable:', error.userMessage);
      return NextResponse.json(
        { error: `The PDF needs OCR, but the vision model could not read it: ${error.userMessage}` },
        { status: 503 },
      );
    }

    console.error('[zyron] contract analysis failed', error);
    return NextResponse.json(
      { error: 'The document could not be analysed. Try uploading it again.' },
      { status: 500 },
    );
  }
}

async function readUploadBytes(file: File): Promise<Uint8Array> {
  const direct = new Uint8Array(await file.arrayBuffer());
  if (direct.byteLength > 0) return direct;

  // Some development runtimes expose a valid multipart File size but return
  // an empty arrayBuffer. Reading the Web stream keeps the upload usable in
  // that case and still works with the normal Next.js File implementation.
  if (file.stream) {
    const reader = file.stream().getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (chunk.value?.byteLength) {
          chunks.push(chunk.value);
          total += chunk.value.byteLength;
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (total > 0) {
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    }
  }

  throw new ExtractionError(
    `The uploaded file arrived empty (declared size: ${file.size} bytes). Choose the PDF again and upload it from the file picker.`,
  );
}

async function ocrScannedPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const { definePDFJSModule, getDocumentProxy, renderPageAsImage } = await import('unpdf');
  await definePDFJSModule(() => import('pdfjs-dist'));
  const pdf = await getDocumentProxy(bytes);
  const pages = pdf.numPages;
  const limit = Math.min(pages, 8);
  const text: string[] = [];

  for (let page = 1; page <= limit; page += 1) {
    const dataUrl = await renderPageAsImage(pdf, page, {
      canvasImport: () => import('@napi-rs/canvas'),
      scale: 1.5,
      toDataURL: true,
    });
    const match = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
    if (!match) continue;
    const pageText = await readImage({
      base64: match[1],
      mimeType: 'image/png',
      prompt: `OCR page ${page} of ${limit}. Transcribe all readable text in order, preserving headings, clause numbers, dates, names, and paragraph boundaries. Return only the transcription.`,
      maxTokens: 2_000,
    });
    if (pageText.trim()) text.push(`Page ${page}\n${pageText.trim()}`);
  }

  return { text: text.join('\n\n'), pages };
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
