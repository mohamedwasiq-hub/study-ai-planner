// Runs one note style over whole chapters with the chosen AI (see ai.js) and saves the result.
import { supabase } from './supabase.js';
import { pageTexts } from './pdf.js';
import { splitPages } from './ranges.js';
import { STYLES } from '../../supabase/functions/_shared/styles.ts';

async function chapterPdf(userId, bookId, ch) {
  const { data, error } = await supabase.storage.from('textbooks').download(`${userId}/${bookId}/${ch.number}.pdf`);
  if (error) throw new Error(`chapter ${ch.number} file is missing (${error.message})`);
  return data;
}

// The chapter's full text in parts the model can hold, every page included (local AI reads text only).
async function chapterParts(engine, pdf, ch) {
  const pages = await pageTexts(new Uint8Array(await pdf.arrayBuffer()));
  if (!pages.join('').trim()) throw new Error(`chapter ${ch.number} has no selectable text, so it is probably a scanned book. Switch to Claude in Settings, which can read scanned pages`);
  return splitPages(pages, engine.maxChars, ch.page_from);
}

// Writes `style` for each chapter in turn. onStatus(text) reports progress. Returns Markdown.
export async function writeForChapters({ engine, profile, bookId, chapters, style, request, onStatus }) {
  const instructions = STYLES[style].prompt(profile) + (style === 'custom' ? `\n\nTHE STUDENT ASKS: ${request}` : '');
  const sections = [];
  for (const [ci, ch] of chapters.entries()) {
    const where = chapters.length > 1 ? `Chapter ${ch.number} (${ci + 1} of ${chapters.length})` : `Chapter ${ch.number}`;
    onStatus(`${where}: reading every page…`);
    const pdf = await chapterPdf(profile.id, bookId, ch);
    const heading = `CHAPTER ${ch.number}: ${ch.title}`;
    let md;
    if (engine.askPdf) {
      md = await engine.askPdf(pdf, `${instructions}\n\nThe attached PDF is ${heading} (book pages ${ch.page_from}-${ch.page_to}).`,
        (words) => onStatus(`${where}: writing… ${words} words`));
    } else {
      const parts = await chapterParts(engine, pdf, ch);
      const out = [];
      for (const [i, part] of parts.entries()) {
        const label = parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : '';
        out.push(await engine.ask(`${instructions}\n\n${heading}${label}\n\n${part}`, (words) => onStatus(`${where}${label}: writing… ${words} words`)));
      }
      md = out.join('\n\n');
    }
    sections.push(chapters.length > 1 ? `## Chapter ${ch.number}: ${ch.title}\n\n${md}` : md);
  }
  return sections.join('\n\n');
}

// Saves a note, replacing an older one of the same kind when `replace` narrows the delete.
export async function saveNote(row, replace) {
  if (replace) {
    const { error } = await replace(supabase.from('notes').delete());
    if (error) throw error;
  }
  const { data, error } = await supabase.from('notes').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}
