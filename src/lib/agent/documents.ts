/**
 * Document ingestion for the DOC module.
 *
 * Turns an uploaded file into plain text that `analyseContract` can read.
 * Everything here runs on the server: pdf parsing needs Node APIs and the
 * library is far too heavy to ship to the browser.
 *
 * The failure cases matter as much as the happy path. A scanned contract is
 * the single most common upload that silently produces nothing useful, so it
 * is detected explicitly and reported rather than analysed into an empty
 * report that claims the document is clean.
 */

export type DocumentKind = 'pdf' | 'text';

export interface ExtractedDocument {
  title: string;
  kind: DocumentKind;
  text: string;
  pages: number;
  /** Bytes of the original upload. */
  bytes: number;
}

export class ExtractionError extends Error {
  /** Shown to the user as-is, so it has to be actionable. */
  readonly userMessage: string;
  /** The original library error, kept for the server log only. */
  readonly reason?: unknown;

  constructor(userMessage: string, reason?: unknown) {
    super(userMessage);
    this.name = 'ExtractionError';
    this.userMessage = userMessage;
    this.reason = reason;
  }
}

/** Anything larger is almost certainly not a contract. */
export const MAX_BYTES = 12 * 1024 * 1024;

/** Below this, a PDF almost certainly has no text layer. */
const MIN_CHARS_PER_PAGE = 90;

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.text'];

export function kindFor(filename: string, mime?: string): DocumentKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'text';
  if (mime?.startsWith('text/')) return 'text';
  return null;
}

export async function extractDocument(file: {
  name: string;
  type?: string;
  bytes: Uint8Array;
}): Promise<ExtractedDocument> {
  const { name, type, bytes } = file;

  if (bytes.byteLength === 0) {
    throw new ExtractionError('That file is empty. Pick the contract again and re-upload it.');
  }
  if (bytes.byteLength > MAX_BYTES) {
    const mb = (bytes.byteLength / 1024 / 1024).toFixed(1);
    throw new ExtractionError(
      `That file is ${mb}MB. Keep uploads under 12MB — split the document or export a text-only version.`,
    );
  }

  const kind = kindFor(name, type);
  if (!kind) {
    throw new ExtractionError(
      'Unsupported file type. Upload a PDF, or paste the text of the agreement directly.',
    );
  }

  const title = cleanTitle(name);

  if (kind === 'text') {
    const text = new TextDecoder('utf-8').decode(bytes).trim();
    if (text.length < 200) {
      throw new ExtractionError('There is too little text in that file to analyse.');
    }
    return { title, kind, text, pages: 1, bytes: bytes.byteLength };
  }

  return extractPdf(title, bytes);
}

async function extractPdf(title: string, bytes: Uint8Array): Promise<ExtractedDocument> {
  let text: string;
  let pages: number;

  try {
    // Imported lazily so the pdf engine is never pulled into a request that
    // does not need it, and never into the client bundle.
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });

    pages = result.totalPages;
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    if (message.includes('password') || message.includes('encrypt')) {
      throw new ExtractionError(
        'That PDF is password protected. Remove the password, or export an unlocked copy, then upload again.',
        error,
      );
    }
    if (message.includes('invalid') || message.includes('structure')) {
      throw new ExtractionError(
        'That file is not a readable PDF. It may be corrupt or only partly downloaded.',
        error,
      );
    }
    throw new ExtractionError('The PDF could not be read. Try re-exporting it and upload again.', error);
  }

  const trimmed = text.replace(/\u0000/g, '').trim();

  // A scanned contract is an image of a page. The parse succeeds and returns
  // almost nothing, which would otherwise be reported as a clean contract.
  if (trimmed.length < MIN_CHARS_PER_PAGE * Math.max(pages, 1)) {
    throw new ExtractionError(
      `This looks like a scanned document — ${pages === 1 ? 'the page has' : 'the pages have'} no text layer, only an image. ` +
        'Run it through OCR first, or paste the text of the clauses you want checked.',
    );
  }

  return { title, kind: 'pdf', text: trimmed, pages, bytes: bytes.byteLength };
}

function cleanTitle(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  const spaced = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!spaced) return 'Untitled document';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
