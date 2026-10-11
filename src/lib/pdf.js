// Runs in the browser: finds chapters and cuts the book into chapter PDFs.
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { rangesFromStarts } from './ranges.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Proposes chapters from the PDF's bookmarks. No bookmarks = one chapter for the whole file.
export async function proposeChapters(bytes, fallbackTitle) {
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const pageCount = doc.numPages;
  const outline = (await doc.getOutline()) || [];
  const starts = [];
  for (const item of outline) {
    try {
      const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
      if (dest?.[0]) starts.push({ title: item.title, page: (await doc.getPageIndex(dest[0])) + 1 });
    } catch { /* bookmark points nowhere usable */ }
  }
  await task.destroy();
  const ranges = starts.length ? rangesFromStarts(starts, pageCount) : [];
  return { pageCount, ranges: ranges.length ? ranges : [{ title: fallbackTitle, from: 1, to: pageCount }] };
}

// The text of every page, in order. Scanned pages (images only) come back empty.
export async function pageTexts(bytes) {
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' '));
  }
  await task.destroy();
  return pages;
}

// Copies pages from..to (1-based, inclusive) into a new PDF.
export async function cutPages(bytes, from, to) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
  pages.forEach((p) => out.addPage(p));
  return new Blob([await out.save()], { type: 'application/pdf' });
}
