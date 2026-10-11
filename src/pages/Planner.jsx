import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, CalendarCheck } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase.js';
import { buildPlan, studiedChapters, todayStr } from '../lib/planner.js';
import { Alert, Button, Field } from '../ui.jsx';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NOTE_FOR = { study: 'detailed', worksheet: 'worksheet', revise: 'revision', final: 'summary' };
const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Day-by-day plan for one book: tick days off, re-plan after missed days.
export default function Planner({ profile }) {
  const { id } = useParams(); // book id
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [notes, setNotes] = useState([]);
  const [plan, setPlan] = useState(undefined); // undefined = loading, null = none yet
  const [days, setDays] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const today = todayStr();

  async function load() {
    const [b, c, n, p] = await Promise.all([
      supabase.from('books').select('id, title').eq('id', id).single(),
      supabase.from('chapters').select('id, number, title, page_from, page_to').eq('book_id', id).order('number'),
      supabase.from('notes').select('id, style, chapter_ids').eq('book_id', id),
      supabase.from('plans').select('*').eq('book_id', id).maybeSingle(),
    ]);
    setBook(b.data); setChapters(c.data || []); setNotes(n.data || []);
    setError(b.error?.message || p.error?.message || '');
    setPlan(p.data);
    if (p.data) {
      const { data } = await supabase.from('plan_days').select('*').eq('plan_id', p.data.id).order('date');
      setDays(data || []);
    }
  }
  useEffect(() => { load(); }, [id]);

  const asChapters = () => chapters.map((c) => ({ id: c.id, number: c.number, title: c.title, pages: c.page_to - c.page_from + 1 }));
  const rows = (planId, built) => built.map((d) => ({ plan_id: planId, date: d.date, items: d.items }));

  async function create(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const examDate = f.get('exam_date');
    const restDays = f.getAll('rest').map(Number);
    setError('');
    let built;
    try { built = buildPlan({ chapters: asChapters(), start: today, examDate, restDays }); } catch (err) { return setError(err.message); }
    setBusy(true);
    const { data: p, error: pe } = await supabase.from('plans').insert({ book_id: id, exam_date: examDate, rest_days: restDays }).select('*').single();
    const { error: de } = pe ? {} : await supabase.from('plan_days').insert(rows(p.id, built));
    if (pe || de) {
      if (p) await supabase.from('plans').delete().eq('id', p.id);
      setError((pe || de).message);
    }
    setBusy(false);
    load();
  }

  async function toggle(day) {
    setDays((ds) => ds.map((d) => (d.id === day.id ? { ...d, done: !d.done } : d)));
    const { error } = await supabase.from('plan_days').update({ done: !day.done }).eq('id', day.id);
    if (error) { setError(error.message); load(); }
  }

  // Keeps finished and past days, rebuilds everything from today for the chapters not yet studied.
  async function replan() {
    const todayDone = days.some((d) => d.date === today && d.done);
    const start = todayDone ? new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : today;
    const done = studiedChapters(days);
    let built;
    try {
      built = buildPlan({ chapters: asChapters(), start, examDate: plan.exam_date, restDays: plan.rest_days, toStudy: chapters.map((c) => c.id).filter((c) => !done.includes(c)) });
    } catch (err) { return setError(err.message); }
    setBusy(true); setError('');
    const { error: de } = await supabase.from('plan_days').delete().eq('plan_id', plan.id).gte('date', start);
    const { error: ie } = de ? {} : await supabase.from('plan_days').insert(rows(plan.id, built));
    if (de || ie) setError(`Re-plan failed: ${(de || ie).message}`);
    setBusy(false);
    load();
  }

  async function startOver() {
    if (!confirm('Delete this plan and make a new one?')) return;
    const { error } = await supabase.from('plans').delete().eq('id', plan.id);
    if (error) return setError(error.message);
    setDays([]); setPlan(null);
  }

  const noteLink = (item) => {
    const n = notes.find((x) => x.style === NOTE_FOR[item.type] && (item.type === 'final' || x.chapter_ids.includes(item.chapterId)));
    return n ? <Link to={`/notes/${n.id}`} className="font-medium text-accent hover:underline">Open</Link>
      : <Link to={`/books/${id}`} className="text-zinc-500 hover:underline">Make it</Link>;
  };

  if (plan === undefined) return <main className="mx-auto max-w-3xl px-4 py-10"><div className="h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" /></main>;

  const missed = days.filter((d) => d.date < today && !d.done);
  const upcoming = days.filter((d) => d.date >= today);
  const shown = showAll ? days : [...missed, ...upcoming.slice(0, 14)];
  const doneCount = days.filter((d) => d.done).length;
  const daysLeft = plan ? Math.round((Date.parse(plan.exam_date) - Date.parse(today)) / 86400000) : 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link to={`/books/${id}`} className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        <ArrowLeft size={16} /> {book?.title || 'Book'}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Study plan</h1>
      <div className="mt-4"><Alert>{error}</Alert></div>

      {!plan && (
        <form onSubmit={create} className="mt-6 grid max-w-md gap-5">
          <p className="text-zinc-600 dark:text-zinc-400">
            Pick your exam date. The plan spreads the {chapters.length} chapters by length, puts a worksheet after each one and keeps the last days for revision.
          </p>
          <Field label="Exam date" name="exam_date" type="date" min={today} defaultValue={profile.exam_date || ''} required />
          <fieldset>
            <legend className="text-sm font-medium">Days off</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((w, i) => (
                <label key={w} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-zinc-300 px-4 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10 dark:border-zinc-700">
                  <input type="checkbox" name="rest" value={i} defaultChecked={i === 0} className="accent-[var(--color-accent)]" /> {w.slice(0, 3)}
                </label>
              ))}
            </div>
          </fieldset>
          <div><Button disabled={busy || !chapters.length}>{busy ? 'Making plan…' : 'Make my plan'}</Button></div>
        </form>
      )}

      {plan && (
        <>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Exam on {fmt(plan.exam_date)} · {daysLeft > 0 ? `${daysLeft} days left` : 'Exam day has passed'} · {doneCount} of {days.length} study days done
          </p>
          {missed.length > 0 && (
            <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <p>You missed {missed.length} {missed.length === 1 ? 'day' : 'days'}. Re-plan to spread the unfinished chapters over the days left.</p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={replan} disabled={busy}>{busy ? 'Re-planning…' : 'Re-plan from today'}</Button>
            <Button variant="secondary" onClick={startOver}>Start over</Button>
          </div>

          <ol className="mt-8 grid gap-3">
            {shown.map((d) => {
              const isToday = d.date === today;
              const late = d.date < today && !d.done;
              return (
                <li key={d.id} className={`rounded-2xl border p-4 ${isToday ? 'border-accent bg-accent/5' : 'border-zinc-200 dark:border-zinc-800'} ${d.done ? 'opacity-60' : ''}`}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={d.done} onChange={() => toggle(d)} className="h-5 w-5 accent-[var(--color-accent)]" aria-label={`Mark ${fmt(d.date)} done`} />
                    <span className="font-semibold">{isToday ? 'Today' : fmt(d.date)}</span>
                    {late && <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Missed</span>}
                  </label>
                  <ul className="mt-3 grid gap-2 pl-8">
                    {d.items.map((it, i) => (
                      <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 text-[15px]">
                        <span className={d.done ? 'line-through' : ''}>{it.label}</span>
                        <span className="text-sm">{noteLink(it)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
          {!showAll && days.length > shown.length && (
            <Button variant="secondary" className="mt-4" onClick={() => setShowAll(true)}>Show all {days.length} days</Button>
          )}
          {days.length === 0 && (
            <p className="mt-8 flex items-center gap-2 text-zinc-600 dark:text-zinc-400"><CalendarCheck size={20} /> No study days left in this plan.</p>
          )}
        </>
      )}
    </main>
  );
}
