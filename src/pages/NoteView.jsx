import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import 'katex/contrib/mhchem'; // \ce{...} prints chemical formulas upright, as textbooks do
import { ArrowLeft, DownloadSimple, Sparkle, Trash } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase.js';
import { hasClaude, premiumPdf } from '../lib/ai.js';
import { STYLES } from '../../supabase/functions/_shared/styles.ts';
import { Alert, Button } from '../ui.jsx';

// Mind maps arrive as ```mermaid blocks. Mermaid is large, so it loads only when a diagram is shown.
function Mermaid({ code }) {
  const id = useId().replace(/:/g, '');
  const [svg, setSvg] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
      try {
        const out = await mermaid.render(`m${id}`, code);
        if (live) setSvg(out.svg);
      } catch { if (live) setFailed(true); }
    });
    return () => { live = false; };
  }, [code]);
  if (failed) return <><Alert>This diagram could not be drawn. Make the mind map again, or read its outline below.</Alert><pre className="mt-2 overflow-x-auto text-sm">{code}</pre></>;
  return <div className="my-6 overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const md = {
  code({ className, children, ...rest }) {
    if (/language-mermaid/.test(className || '')) return <Mermaid code={String(children).trim()} />;
    return <code className={className} {...rest}>{children}</code>;
  },
  pre: ({ node, children }) => (node?.children?.[0]?.properties?.className?.includes('language-mermaid') ? children : <pre>{children}</pre>),
  table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
};

export function NoteBody({ markdown }) {
  return (
    <article className="notes mt-6">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={md}>{markdown}</ReactMarkdown>
    </article>
  );
}

export default function NoteView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [note, setNote] = useState(null);
  const [meta, setMeta] = useState({ book: null, chapters: [] });
  const [error, setError] = useState('');
  const [premiumBusy, setPremiumBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: n, error } = await supabase.from('notes').select('*').eq('id', id).single();
      if (error) return setError('This note could not be found.');
      const [b, c] = await Promise.all([
        supabase.from('books').select('id, title, class, subject').eq('id', n.book_id).single(),
        supabase.from('chapters').select('id, number, title').in('id', n.chapter_ids.length ? n.chapter_ids : ['00000000-0000-0000-0000-000000000000']).order('number'),
      ]);
      setNote(n);
      setMeta({ book: b.data, chapters: c.data || [] });
      document.title = `${STYLES[n.style]?.label || 'Notes'} · ${b.data?.title || ''}`;
    })();
    return () => { document.title = 'Study AI Planner'; };
  }, [id]);

  async function premium() {
    setPremiumBusy(true); setError('');
    try {
      const blob = await premiumPdf(note.content_md, `${STYLES[note.style]?.label || 'Notes'}: ${meta.book?.title || ''}`);
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${(STYLES[note.style]?.label || 'notes').replace(/\W+/g, '-').toLowerCase()}.pdf` });
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setError(e.message); }
    setPremiumBusy(false);
  }

  async function remove() {
    if (!confirm('Delete this for good?')) return;
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) return setError(error.message);
    nav(`/books/${note.book_id}`);
  }

  if (!note) return <main className="mx-auto max-w-3xl px-4 py-10">{error ? <Alert>{error}</Alert> : <div className="h-60 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}</main>;

  const title = STYLES[note.style]?.label || 'Notes';
  const sub = meta.chapters.length === 1 ? `Chapter ${meta.chapters[0].number}: ${meta.chapters[0].title}`
    : meta.chapters.length ? `Chapters ${meta.chapters.map((c) => c.number).join(', ')}` : 'Whole book';

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/books/${note.book_id}`} className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          <ArrowLeft size={16} /> {meta.book?.title || 'Back'}
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={remove} aria-label="Delete"><Trash size={18} /></Button>
          {hasClaude() && (
            <Button variant="secondary" onClick={premium} disabled={premiumBusy}>
              <Sparkle size={18} /> {premiumBusy ? 'Making PDF… (about a minute)' : 'Premium PDF'}
            </Button>
          )}
          <Button onClick={() => window.print()}><DownloadSimple size={18} /> Download PDF</Button>
        </div>
      </div>
      <p className="mt-2 text-sm text-zinc-500 print:hidden">In the print window, choose "Save as PDF".</p>
      <Alert>{error}</Alert>

      <header className="mt-8 border-b border-zinc-200 pb-4 dark:border-zinc-800 print:mt-0">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{meta.book?.title} · Class {meta.book?.class} {meta.book?.subject}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-zinc-700 dark:text-zinc-300">{sub}</p>
        {note.prompt && <p className="mt-2 text-sm italic text-zinc-600 dark:text-zinc-400">You asked: {note.prompt}</p>}
      </header>

      <NoteBody markdown={note.content_md} />
    </main>
  );
}
