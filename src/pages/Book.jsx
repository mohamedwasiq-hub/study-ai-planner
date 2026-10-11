import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, CalendarBlank, CheckCircle, Circle, CircleNotch, Trash, WarningCircle } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase.js';
import { splitPages } from '../lib/ranges.js';
import { startEngine } from '../lib/ai.js';
import { saveNote, writeForChapters } from '../lib/generate.js';
import { STYLES } from '../../supabase/functions/_shared/styles.ts';
import { Alert, Button } from '../ui.jsx';

const MENU = Object.entries(STYLES).filter(([, s]) => s.menu);

// A book's chapters: the local AI reads them one by one (resuming wherever it stopped),
// then the student makes revision sheets, worksheets and more from any chapters.
export default function Book({ profile }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [notes, setNotes] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [engineInfo, setEngineInfo] = useState(null);
  const [style, setStyle] = useState('revision');
  const [picked, setPicked] = useState([]); // chapter ids for "Make notes"
  const [request, setRequest] = useState('');
  const running = useRef(false);

  async function load() {
    const [b, c, n] = await Promise.all([
      supabase.from('books').select('*').eq('id', id).single(),
      supabase.from('chapters').select('*').eq('book_id', id).order('number'),
      supabase.from('notes').select('id, style, chapter_ids, prompt, created_at').eq('book_id', id).order('created_at', { ascending: false }),
    ]);
    setBook(b.data); setChapters(c.data || []); setNotes(n.data || []);
    setError(b.error?.message || '');
    return { book: b.data, chapters: c.data || [], notes: n.data || [] };
  }

  // Runs one AI job at a time and turns failures into a message.
  async function job(fn) {
    if (running.current) return;
    running.current = true;
    setError('');
    try {
      setStatus('Starting the local AI…');
      const engine = await startEngine();
      setEngineInfo(engine);
      await fn(engine);
    } catch (e) {
      setError(`Stopped: ${e.message}.`);
    } finally {
      setStatus('');
      running.current = false;
      await load();
    }
  }

  const readAll = () => job(async (engine) => {
    let s = await load();
    for (const ch of s.chapters.filter((c) => c.status !== 'done')) {
      setChapters((cs) => cs.map((c) => (c.id === ch.id ? { ...c, status: 'reading' } : c)));
      try {
        const md = await writeForChapters({ engine, profile, bookId: id, chapters: [ch], style: 'detailed', onStatus: (t) => setStatus(`${t} (of ${s.chapters.length})`) });
        await saveNote({ book_id: id, chapter_ids: [ch.id], style: 'detailed', provider: engine.provider, content_md: md },
          (q) => q.eq('book_id', id).eq('style', 'detailed').contains('chapter_ids', [ch.id]));
        await supabase.from('chapters').update({ status: 'done' }).eq('id', ch.id);
      } catch (e) {
        await supabase.from('chapters').update({ status: 'error' }).eq('id', ch.id);
        throw new Error(`${e.message}. Press "Continue reading" to pick up where it stopped`);
      }
      s = await load();
    }
    if (s.notes.some((n) => n.style === 'summary')) return;
    const { data: detailed } = await supabase.from('notes').select('chapter_ids, content_md').eq('book_id', id).eq('style', 'detailed');
    const chapterNotes = s.chapters.map((c) => `Chapter ${c.number}: ${c.title}\n${detailed.find((n) => n.chapter_ids.includes(c.id))?.content_md || ''}`);
    const groups = splitPages(chapterNotes, engine.maxChars, 1, 'Chapter notes');
    const out = [];
    for (const [i, g] of groups.entries()) {
      out.push(await engine.ask(`${STYLES.summary.prompt(profile)}\n\n${g}`,
        (words) => setStatus(`Writing the whole-book summary${groups.length > 1 ? ` (part ${i + 1} of ${groups.length})` : ''}… ${words} words`)));
    }
    await saveNote({ book_id: id, style: 'summary', provider: engine.provider, content_md: out.join('\n\n') }, (q) => q.eq('book_id', id).eq('style', 'summary'));
    await supabase.from('books').update({ status: 'done' }).eq('id', id);
  });

  const make = () => {
    if (!picked.length) return setError('Tick at least one chapter.');
    if (style === 'custom' && !request.trim()) return setError('Type what you want, for example "10 MCQs on balancing equations".');
    const chosen = chapters.filter((c) => picked.includes(c.id));
    job(async (engine) => {
      const md = await writeForChapters({ engine, profile, bookId: id, chapters: chosen, style, request: request.trim(), onStatus: setStatus });
      const noteId = await saveNote({ book_id: id, chapter_ids: picked, style, prompt: style === 'custom' ? request.trim() : null, provider: engine.provider, content_md: md });
      nav(`/notes/${noteId}`);
    });
  };

  async function removeBook() {
    if (!confirm(`Delete "${book.title}" with all its notes, sheets and plan? This cannot be undone.`)) return;
    const folder = `${profile.id}/${id}`;
    const { data: files } = await supabase.storage.from('textbooks').list(folder);
    if (files?.length) {
      const { error: se } = await supabase.storage.from('textbooks').remove(files.map((f) => `${folder}/${f.name}`));
      if (se) return setError(`Could not delete the PDFs: ${se.message}`);
    }
    const { error: be } = await supabase.from('books').delete().eq('id', id); // chapters, notes and plan go with it
    if (be) return setError(be.message);
    nav('/');
  }

  useEffect(() => {
    load().then((s) => { if (params.get('start') && s.chapters.some((c) => c.status !== 'done')) readAll(); });
  }, [id]);

  if (!book) {
    return <main className="mx-auto max-w-3xl px-4 py-10">{error ? <Alert>{error}</Alert> : <div className="h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}</main>;
  }

  const done = chapters.filter((c) => c.status === 'done').length;
  const summary = notes.find((n) => n.style === 'summary');
  const noteFor = (ch) => notes.find((n) => n.style === 'detailed' && n.chapter_ids.includes(ch.id));
  const made = notes.filter((n) => !['detailed', 'summary'].includes(n.style));
  const chapterNames = (ids) => chapters.filter((c) => ids.includes(c.id)).map((c) => c.number).join(', ');
  const busy = !!status;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        <ArrowLeft size={16} /> Your books
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{book.title}</h1>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <p className="text-zinc-600 dark:text-zinc-400">Class {book.class} · {book.subject} · {done} of {chapters.length} chapters read</p>
        <Link to={`/books/${id}/plan`} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">
          <CalendarBlank size={18} /> Study plan
        </Link>
      </div>

      <div className="mt-6 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" role="progressbar" aria-label="Chapters read" aria-valuemin={0} aria-valuemax={chapters.length} aria-valuenow={done}>
        <div className="h-full bg-accent transition-all" style={{ width: `${chapters.length ? (done / chapters.length) * 100 : 0}%` }} />
      </div>
      {busy && <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300" aria-live="polite">{status}</p>}
      {busy && engineInfo && (
        <p className="mt-1 text-sm text-zinc-500">
          {engineInfo.provider === 'local' ? `Running on this computer with ${engineInfo.name}.` : 'Running on Claude with your API key.'} Keep this tab open; a chapter can take several minutes.
        </p>
      )}
      <div className="mt-4"><Alert>{error}</Alert></div>
      {!busy && (done < chapters.length || !summary) && (
        <Button className="mt-4" onClick={readAll}>{done ? 'Continue reading' : 'Start reading'}</Button>
      )}

      {summary && (
        <Link to={`/notes/${summary.id}`} className="mt-8 block rounded-2xl bg-accent/10 p-5 hover:bg-accent/15">
          <p className="font-semibold">Whole-book summary</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Every chapter's key ideas in one place</p>
        </Link>
      )}

      <h2 className="mt-10 text-lg font-semibold">Chapters</h2>
      <ol className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
        {chapters.map((ch) => {
          const note = noteFor(ch);
          const Icon = { done: CheckCircle, reading: CircleNotch, error: WarningCircle }[ch.status] || Circle;
          return (
            <li key={ch.id} className="flex items-center gap-3 py-3">
              <Icon size={22} weight={ch.status === 'done' ? 'fill' : 'regular'} aria-label={ch.status}
                className={`shrink-0 ${ch.status === 'done' ? 'text-accent' : ch.status === 'error' ? 'text-red-600' : 'text-zinc-400'} ${ch.status === 'reading' ? 'animate-spin' : ''}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{ch.number}. {ch.title}</p>
                <p className="text-sm text-zinc-500">Pages {ch.page_from}-{ch.page_to}</p>
              </div>
              {note && <Link to={`/notes/${note.id}`} className="inline-flex h-10 items-center rounded-[10px] border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">Notes</Link>}
            </li>
          );
        })}
      </ol>

      <section className="mt-12 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Make notes and sheets</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Pick what you want and which chapters. The AI reads those chapters again in full.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="What to make">
          {[...MENU, ['custom', STYLES.custom]].map(([key, s]) => (
            <button key={key} type="button" role="radio" aria-checked={style === key} onClick={() => setStyle(key)}
              className={`rounded-[10px] border p-3 text-left transition ${style === key ? 'border-accent bg-accent/10' : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600'}`}>
              <span className="block font-medium">{s.label}</span>
              <span className="block text-sm text-zinc-600 dark:text-zinc-400">{s.hint}</span>
            </button>
          ))}
        </div>
        {style === 'custom' && (
          <div className="mt-4 grid gap-2">
            <label htmlFor="request" className="text-sm font-medium">What do you want?</label>
            <textarea id="request" rows={3} value={request} onChange={(e) => setRequest(e.target.value)}
              placeholder="e.g. Explain the difference between displacement and double displacement reactions with a table"
              className="rounded-[10px] border border-zinc-300 bg-white p-3 text-base placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
        )}
        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Chapters</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {chapters.map((c) => (
              <label key={c.id} className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm ${picked.includes(c.id) ? 'border-accent bg-accent/10' : 'border-zinc-300 dark:border-zinc-700'}`}>
                <input type="checkbox" className="accent-[var(--color-accent)]" checked={picked.includes(c.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                {c.number}. {c.title}
              </label>
            ))}
          </div>
        </fieldset>
        <Button className="mt-5" onClick={make} disabled={busy}>Make {STYLES[style].label.toLowerCase()}</Button>
      </section>

      {made.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold">Your notes and sheets</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {made.map((n) => (
              <li key={n.id}>
                <Link to={`/notes/${n.id}`} className="block rounded-[10px] border border-zinc-200 p-3 hover:border-accent dark:border-zinc-800">
                  <span className="block font-medium">{STYLES[n.style]?.label || n.style}</span>
                  <span className="block truncate text-sm text-zinc-600 dark:text-zinc-400">
                    {n.prompt ? `"${n.prompt}" · ` : ''}Chapter {chapterNames(n.chapter_ids)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {!busy && (
        <button onClick={removeBook} className="mt-12 inline-flex items-center gap-2 text-sm font-medium text-red-700 hover:underline dark:text-red-400">
          <Trash size={16} /> Delete this book
        </button>
      )}
    </main>
  );
}
