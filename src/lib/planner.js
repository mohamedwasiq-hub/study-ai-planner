// Builds a day-by-day study plan. Pure code (no AI, no network) so it is free, instant and tested.
// Dates are 'YYYY-MM-DD' strings handled in UTC so daylight-saving never shifts a day.

const DAY = 86400000;
const toMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const toDate = (ms) => new Date(ms).toISOString().slice(0, 10);
export const todayStr = () => { const n = new Date(); return toDate(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); };

// Study days from `start` up to the day before the exam, skipping rest weekdays (0 = Sunday).
export function studyDays(start, examDate, restDays = []) {
  const out = [];
  for (let t = toMs(start); t < toMs(examDate); t += DAY) {
    if (!restDays.includes(new Date(t).getUTCDay())) out.push(toDate(t));
  }
  return out;
}

// Lays items of given weights on a line and gives each day an equal slice of it.
// Every item lands on every day its slice overlaps, so long chapters span days and short ones share a day.
function spread(items, weightOf, dayCount) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  const perDay = total / dayCount;
  const days = Array.from({ length: dayCount }, () => []);
  let pos = 0;
  for (const it of items) {
    const start = pos;
    const end = pos + weightOf(it);
    pos = end;
    const first = Math.min(dayCount - 1, Math.floor(start / perDay + 1e-9));
    const last = Math.min(dayCount - 1, Math.max(first, Math.ceil(end / perDay - 1e-9) - 1));
    for (let d = first; d <= last; d++) days[d].push({ it, part: d - first + 1, of: last - first + 1 });
  }
  return days;
}

/**
 * chapters: [{ id, number, title, pages }] in book order.
 * toStudy: ids still to be studied (default: all). Done chapters still get revised.
 * Returns [{ date, items: [{ type: 'study'|'worksheet'|'revise'|'final', chapterId?, label }] }].
 */
export function buildPlan({ chapters, start, examDate, restDays = [], toStudy }) {
  if (!chapters.length) throw new Error('This book has no chapters yet.');
  if (toMs(examDate) <= toMs(start)) throw new Error('The exam date must be after today.');
  const days = studyDays(start, examDate, restDays);
  if (!days.length) throw new Error('No study days left before the exam. Allow rest days or pick a later date.');

  const study = chapters.filter((c) => !toStudy || toStudy.includes(c.id));
  // About a fifth of the time goes to revision, at least 1 day and at most 7, but never all of it.
  const revisionCount = study.length ? Math.min(7, Math.max(1, Math.round(days.length * 0.2)), days.length - 1) : days.length;
  const studyCount = days.length - revisionCount;
  const plan = days.map((date) => ({ date, items: [] }));

  if (study.length && studyCount > 0) {
    spread(study, (c) => Math.max(1, c.pages), studyCount).forEach((slots, d) => {
      for (const { it: c, part, of } of slots) {
        plan[d].items.push({ type: 'study', chapterId: c.id, label: `Study chapter ${c.number}: ${c.title}${of > 1 ? ` (part ${part} of ${of})` : ''}` });
        if (part === of) plan[d].items.push({ type: 'worksheet', chapterId: c.id, label: `Worksheet on chapter ${c.number}` });
      }
    });
  } else if (study.length) {
    // One day left: study everything that day.
    for (const c of study) plan[0].items.push({ type: 'study', chapterId: c.id, label: `Study chapter ${c.number}: ${c.title}` });
  }

  const revDays = plan.slice(studyCount);
  if (revDays.length) {
    spread(chapters, () => 1, revDays.length).forEach((slots, d) => {
      for (const { it: c } of slots.filter((s) => s.part === 1)) {
        revDays[d].items.push({ type: 'revise', chapterId: c.id, label: `Revise chapter ${c.number} with its revision sheet` });
      }
    });
    revDays.at(-1).items.push({ type: 'final', label: 'Read the whole-book summary and formula sheets' });
  }
  return plan;
}

// Chapters whose every study item sits on a ticked-off day.
export function studiedChapters(planDays) {
  const status = new Map();
  for (const d of planDays) {
    for (const it of d.items.filter((i) => i.type === 'study')) status.set(it.chapterId, (status.get(it.chapterId) ?? true) && d.done);
  }
  return [...status].filter(([, done]) => done).map(([id]) => id);
}
