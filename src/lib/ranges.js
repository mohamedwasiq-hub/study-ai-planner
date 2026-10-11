// Turns chapter start pages (from the PDF outline) into page ranges.
// starts: [{ title, page }] with 1-based pages, in any order. Returns [{ title, from, to }].
export function rangesFromStarts(starts, pageCount) {
  const sorted = starts
    .filter((s) => s.page >= 1 && s.page <= pageCount)
    .sort((a, b) => a.page - b.page)
    .filter((s, i, all) => i === 0 || s.page !== all[i - 1].page); // two entries on one page = one chapter
  return sorted.map((s, i) => ({
    title: s.title.trim() || `Chapter ${i + 1}`,
    from: s.page,
    to: i + 1 < sorted.length ? sorted[i + 1].page - 1 : pageCount,
  }));
}

// Groups page texts into parts under maxChars each, never splitting a page. Every page lands in exactly one part.
// pages: ['text of page 1', ...]; firstPage: the book page number of pages[0]. Returns ['--- Page 12 ---\n...', ...].
export function splitPages(pages, maxChars, firstPage = 1, label = 'Page') {
  const parts = [];
  let cur = '';
  pages.forEach((t, i) => {
    const page = `--- ${label} ${firstPage + i} ---\n${t.trim()}\n`;
    if (cur && cur.length + page.length > maxChars) { parts.push(cur); cur = ''; }
    cur += page;
  });
  if (cur) parts.push(cur);
  return parts;
}

// Checks ranges the student edited by hand. Returns an error message or ''.
export function checkRanges(ranges, pageCount) {
  if (!ranges.length) return 'Add at least one chapter.';
  for (const [i, r] of ranges.entries()) {
    const n = i + 1;
    if (!r.title.trim()) return `Chapter ${n} needs a title.`;
    if (!(r.from >= 1 && r.to <= pageCount && r.from <= r.to)) return `Chapter ${n}: pages must be between 1 and ${pageCount}, and "from" must not be after "to".`;
    if (i > 0 && r.from <= ranges[i - 1].to) return `Chapter ${n} overlaps chapter ${i}.`;
  }
  return '';
}
