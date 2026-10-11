import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, studiedChapters, studyDays } from '../src/lib/planner.js';

const book = Array.from({ length: 13 }, (_, i) => ({ id: `c${i + 1}`, number: i + 1, title: `Ch ${i + 1}`, pages: 15 + (i % 4) * 5 }));
const ids = (plan, type) => new Set(plan.flatMap((d) => d.items.filter((i) => i.type === type).map((i) => i.chapterId)));

test('every chapter is studied, worksheeted and revised before the exam', () => {
  const plan = buildPlan({ chapters: book, start: '2026-11-01', examDate: '2027-02-20' });
  assert.ok(plan.at(-1).date < '2027-02-20');
  assert.equal(plan[0].date, '2026-11-01');
  for (const type of ['study', 'worksheet', 'revise']) assert.equal(ids(plan, type).size, 13, type);
  assert.equal(plan.at(-1).items.at(-1).type, 'final');
});

test('worksheet comes on the day a chapter is finished, never before its study', () => {
  const plan = buildPlan({ chapters: book, start: '2026-11-01', examDate: '2026-12-20' });
  for (const c of book) {
    const lastStudy = plan.findLastIndex((d) => d.items.some((i) => i.type === 'study' && i.chapterId === c.id));
    const ws = plan.findIndex((d) => d.items.some((i) => i.type === 'worksheet' && i.chapterId === c.id));
    assert.equal(ws, lastStudy, c.id);
  }
});

test('fewer days than chapters still schedules everything', () => {
  const plan = buildPlan({ chapters: book, start: '2026-11-01', examDate: '2026-11-06' }); // 5 days
  assert.equal(plan.length, 5);
  assert.equal(ids(plan, 'study').size, 13);
});

test('one day left: study everything that day', () => {
  const plan = buildPlan({ chapters: book.slice(0, 3), start: '2026-11-01', examDate: '2026-11-02' });
  assert.equal(plan.length, 1);
  assert.equal(ids(plan, 'study').size, 3);
});

test('rest days are skipped', () => {
  const days = studyDays('2026-11-01', '2026-11-15', [0]); // 1 Nov 2026 is a Sunday
  assert.equal(days.length, 12);
  assert.ok(!days.includes('2026-11-01') && !days.includes('2026-11-08'));
});

test('bad dates are rejected', () => {
  assert.throws(() => buildPlan({ chapters: book, start: '2026-11-05', examDate: '2026-11-05' }), /after today/);
  assert.throws(() => buildPlan({ chapters: book, start: '2026-11-07', examDate: '2026-11-08', restDays: [6] }), /No study days/);
});

test('re-plan: ticked chapters are not studied again but are still revised', () => {
  const first = buildPlan({ chapters: book, start: '2026-11-01', examDate: '2027-01-30' });
  const ticked = first.map((d, i) => ({ ...d, done: i < 10 }));
  const done = studiedChapters(ticked);
  assert.ok(done.length > 0);
  const again = buildPlan({ chapters: book, start: '2026-11-11', examDate: '2027-01-30', toStudy: book.map((c) => c.id).filter((id) => !done.includes(id)) });
  for (const id of done) assert.ok(!ids(again, 'study').has(id));
  assert.equal(ids(again, 'study').size + done.length, 13);
  assert.equal(ids(again, 'revise').size, 13);
});
