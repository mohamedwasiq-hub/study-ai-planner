import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase.js';
import { cutPages, proposeChapters } from '../lib/pdf.js';
import { checkRanges } from '../lib/ranges.js';
import { Alert, Button, Field } from '../ui.jsx';

const SUBJECTS = ['Science', 'Mathematics', 'Social Science', 'English', 'Hindi', 'Physics', 'Chemistry', 'Biology',
  'Accountancy', 'Business Studies', 'Economics', 'History', 'Geography', 'Political Science', 'Other'];
const MAX_MB = 50;

// Add a book: one whole-book PDF (split by bookmarks or by hand) or several chapter PDFs.
export default function NewBook({ profile }) {
  const nav = useNavigate();
  const [files, setFiles] = useState([]); // [{ file, bytes, pageCount }]
  const [chapters, setChapters] = useState([]); // [{ title, from, to, fileIdx }]
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function pick(e) {
    setError('');
    const picked = [...e.target.files];
    if (!picked.length) return;
    if (picked.some((f) => f.type !== 'application/pdf')) return setError('Only PDF files can be uploaded.');
    if (picked.some((f) => f.size > MAX_MB * 1024 * 1024)) return setError(`Each PDF must be under ${MAX_MB} MB.`);
    setBusy('Reading the PDF…');
    try {
      const loaded = [];
      const found = [];
      for (const [fileIdx, file] of picked.entries()) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const name = file.name.replace(/\.pdf$/i, '');
        const { pageCount, ranges } = await proposeChapters(bytes, name);
        loaded.push({ file, bytes, pageCount });
        // Several files = each file is a chapter; one file = use its bookmarks.
        found.push(...(picked.length > 1 ? [{ title: name, from: 1, to: pageCount }] : ranges).map((r) => ({ ...r, fileIdx })));
      }
      setFiles(loaded);
      setChapters(found);
    } catch (err) {
      setError(`Could not read that PDF (${err.message}). If it is password-protected, remove the password first.`);
    }
    setBusy('');
  }

  const edit = (i, patch) => setChapters((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function submit(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (!files.length) return setError('Choose your textbook PDF.');
    for (const [idx, file] of files.entries()) {
      const own = chapters.filter((c) => c.fileIdx === idx);
      const msg = checkRanges(own, file.pageCount);
      if (msg) return setError(files.length > 1 ? `${file.file.name}: ${msg}` : msg);
    }
    setError('');
    setBusy('Creating the book…');
    const { data: book, error: be } = await supabase.from('books')
      .insert({ class: Number(f.class), subject: f.subject, title: f.title.trim(), status: 'reading' }).select('id').single();
    if (be) { setBusy(''); return setError(be.message); }
    try {
      const rows = chapters.map((c, i) => ({ book_id: book.id, number: i + 1, title: c.title.trim(), page_from: c.from, page_to: c.to }));
      const { error: ce } = await supabase.from('chapters').insert(rows);
      if (ce) throw ce;
      for (const [i, c] of chapters.entries()) {
        setBusy(`Uploading chapter ${i + 1} of ${chapters.length}…`);
        const src = files[c.fileIdx];
        const whole = c.from === 1 && c.to === src.pageCount;
        const blob = whole ? src.file : await cutPages(src.bytes, c.from, c.to);
        const { error: ue } = await supabase.storage.from('textbooks')
          .upload(`${profile.id}/${book.id}/${i + 1}.pdf`, blob, { contentType: 'application/pdf', upsert: true });
        if (ue) throw ue;
      }
      nav(`/books/${book.id}?start=1`);
    } catch (err) {
      await supabase.from('books').delete().eq('id', book.id); // leave nothing half-made behind
      setBusy('');
      setError(`Upload failed: ${err.message}`);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        <ArrowLeft size={16} /> Your books
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Add a textbook</h1>
      <p className="mt-2 max-w-[60ch] text-zinc-600 dark:text-zinc-400">
        Upload the whole book, or the chapter PDFs from ncert.nic.in. The AI reads every page of every chapter.
      </p>
      <form onSubmit={submit} className="mt-8 grid gap-6">
        <div className="grid gap-5 sm:grid-cols-[1fr_1fr_2fr]">
          <Field label="Class" name="class" defaultValue={profile.class}>
            {[9, 10, 11, 12].map((n) => <option key={n} value={n}>Class {n}</option>)}
          </Field>
          <Field label="Subject" name="subject" defaultValue="Science">
            {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
          </Field>
          <Field label="Book title" name="title" placeholder="e.g. NCERT Science" required />
        </div>
        <div className="grid gap-2">
          <label htmlFor="pdf" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Textbook PDF</label>
          <input id="pdf" type="file" accept="application/pdf" multiple onChange={pick} disabled={!!busy}
            className="block w-full text-sm text-zinc-700 file:mr-4 file:h-11 file:rounded-[10px] file:border-0 file:bg-zinc-200 file:px-4 file:font-semibold file:text-zinc-900 hover:file:bg-zinc-300 dark:text-zinc-300 dark:file:bg-zinc-800 dark:file:text-zinc-100" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Up to {MAX_MB} MB per file. Pick several files to upload one PDF per chapter. Books are read by the AI running on this computer (Ollama), so the text is not sent to any AI company.
          </p>
        </div>

        {chapters.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold">Chapters ({chapters.length})</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Check the titles and page numbers. Page numbers are PDF pages, not the printed numbers.</p>
            <ol className="mt-4 grid gap-3">
              {chapters.map((c, i) => (
                <li key={i} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 sm:grid-cols-[2rem_1fr_5rem_5rem_auto]">
                  <span className="text-sm text-zinc-500">{i + 1}</span>
                  <input aria-label={`Chapter ${i + 1} title`} value={c.title} onChange={(e) => edit(i, { title: e.target.value })}
                    className="h-10 min-w-0 rounded-[10px] border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900" />
                  <div className="col-span-2 col-start-2 row-start-2 flex gap-3 sm:col-span-1 sm:col-start-auto sm:row-start-auto sm:contents">
                    <input aria-label={`Chapter ${i + 1} first page`} type="number" min="1" value={c.from} onChange={(e) => edit(i, { from: Number(e.target.value) })}
                      className="h-10 w-20 rounded-[10px] border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900" />
                    <input aria-label={`Chapter ${i + 1} last page`} type="number" min="1" value={c.to} onChange={(e) => edit(i, { to: Number(e.target.value) })}
                      className="h-10 w-20 rounded-[10px] border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900" />
                  </div>
                  <button type="button" aria-label={`Remove chapter ${i + 1}`} onClick={() => setChapters((cs) => cs.filter((_, j) => j !== i))}
                    className="grid h-10 w-10 place-items-center rounded-[10px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900">
                    <Trash size={18} />
                  </button>
                </li>
              ))}
            </ol>
            {files.length === 1 && (
              <Button type="button" variant="secondary" className="mt-4"
                onClick={() => {
                  const last = chapters.at(-1);
                  const pc = files[0].pageCount;
                  const from = Math.min((last?.to ?? 0) + 1, pc);
                  setChapters((cs) => [...cs, { title: `Chapter ${cs.length + 1}`, from, to: pc, fileIdx: 0 }]);
                }}>
                <Plus size={16} /> Add chapter
              </Button>
            )}
          </section>
        )}
        <Alert>{error}</Alert>
        <div><Button disabled={!!busy}>{busy || 'Upload and start reading'}</Button></div>
      </form>
    </main>
  );
}
