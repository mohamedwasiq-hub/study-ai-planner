import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangesFromStarts, checkRanges, splitPages } from '../src/lib/ranges.js';

test('splitPages keeps every page, in order, within the size limit', () => {
  const pages = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)];
  const parts = splitPages(pages, 100, 5); // each page block is 56 chars, so only one fits per part
  assert.equal(parts.length, 3);
  assert.match(parts[0], /--- Page 5 ---/);
  assert.match(parts[2], /--- Page 7 ---\nc{40}/);
  const all = splitPages(pages, 10_000, 1);
  assert.equal(all.length, 1);
  assert.deepEqual([...all[0].matchAll(/--- Page (\d+) ---/g)].map((m) => m[1]), ['1', '2', '3']);
});

test('outline starts become contiguous ranges covering the book', () => {
  const r = rangesFromStarts([{ title: 'Light', page: 30 }, { title: 'Acids', page: 1 }, { title: 'Metals', page: 14 }], 50);
  assert.deepEqual(r, [
    { title: 'Acids', from: 1, to: 13 },
    { title: 'Metals', from: 14, to: 29 },
    { title: 'Light', from: 30, to: 50 },
  ]);
});

test('duplicate and out-of-range starts are dropped', () => {
  const r = rangesFromStarts([{ title: 'A', page: 1 }, { title: 'A2', page: 1 }, { title: 'X', page: 99 }], 10);
  assert.deepEqual(r, [{ title: 'A', from: 1, to: 10 }]);
});

test('checkRanges catches overlaps, bad pages and blank titles', () => {
  assert.equal(checkRanges([{ title: 'A', from: 1, to: 5 }, { title: 'B', from: 6, to: 10 }], 10), '');
  assert.match(checkRanges([{ title: 'A', from: 1, to: 5 }, { title: 'B', from: 5, to: 10 }], 10), /overlaps/);
  assert.match(checkRanges([{ title: 'A', from: 3, to: 2 }], 10), /pages/);
  assert.match(checkRanges([{ title: ' ', from: 1, to: 2 }], 10), /title/);
  assert.match(checkRanges([], 10), /at least one/);
});
