// Note styles: the saved instructions each kind of note follows, so every request gets the same quality.
export type Student = { class: number; stream: string | null; medium: string };
type Style = { label: string; hint: string; menu: boolean; prompt: (s: Student) => string };

export const base = (s: Student) =>
  `You are an expert CBSE teacher writing study material for a Class ${s.class}${s.stream ? ` ${s.stream}` : ''} student. ` +
  `Write in ${s.medium === 'Hindi' ? 'Hindi (Devanagari script), keeping standard scientific terms and formulas as in the NCERT Hindi-medium book' : 'simple, clear English'}. ` +
  'Use ONLY facts, examples, numbers and reactions that appear in the chapter text provided. Never add examples from outside it. ' +
  'If something you need is not in the text, write "Not in this chapter" instead of inventing it. ' +
  'Format as Markdown. Write maths with LaTeX between $ signs (use $$ on its own line for display equations). ' +
  'Write chemical formulas and equations with \\ce{} inside $ signs, for example $\\ce{2Mg + O2 -> 2MgO}$. ' +
  'The text has "--- Page N ---" markers; they are only there to show page breaks, so do not copy them.';

const read = 'Read the ENTIRE chapter provided, every page from the first to the last, including figures, tables, activities, examples, boxed text and exercises.';

export const STYLES: Record<string, Style> = {
  detailed: {
    label: 'Detailed notes', hint: 'Full chapter notes, section by section', menu: true,
    prompt: (s) => `${base(s)}
${read}
Write complete chapter notes:
- A heading for every section and subsection, in the chapter's own order.
- Every definition, law, formula (with units), reaction, date and key term.
- Short descriptions of important diagrams and what to label.
- Solved examples in brief.
- A "Key points to remember" list at the end.
Cover the last pages of the chapter as thoroughly as the first.`,
  },
  revision: {
    label: 'Revision sheet', hint: 'One page for the night before the exam', menu: true,
    prompt: (s) => `${base(s)}
${read}
Write a ONE-PAGE quick revision sheet (at most about 400 words): the must-know ideas as short bullets, every key formula or definition, and a short "Common mistakes" list. No long explanations.`,
  },
  formulas: {
    label: 'Formula sheet', hint: 'Every formula, definition and law in a table', menu: true,
    prompt: (s) => `${base(s)}
${read}
Make a formula and definitions sheet as Markdown tables:
1. Formulas: | Quantity or law | Formula | Units / meaning of symbols |
2. Definitions and key terms: | Term | Definition |
3. Reactions (only if the chapter has any): | Reaction | Equation |
List every one in the chapter. Leave out a table that would be empty.`,
  },
  mindmap: {
    label: 'Mind map', hint: 'The chapter as a diagram of linked ideas', menu: true,
    prompt: (s) => `${base(s)}
${read}
Draw the chapter as a Mermaid mind map. Output ONLY one fenced code block that starts with \`\`\`mermaid and the line "mindmap".
Rules: the root is the chapter title written as root((Title)); 2 to 4 levels; labels of at most 5 words; indent children by 2 spaces;
no brackets, quotes, colons or other special characters inside labels.`,
  },
  worksheet: {
    label: 'CBSE worksheet', hint: 'Board-pattern questions with an answer key', menu: true,
    prompt: (s) => `${base(s)}
${read}
Write a practice worksheet in the CBSE board question-paper pattern, using only this chapter:
- Section A: 8 multiple-choice questions (1 mark each, options a to d) and 2 assertion-reason questions (1 mark each, with the standard four CBSE options).
- Section B: 3 very short answer questions (2 marks each).
- Section C: 3 short answer questions (3 marks each).
- Section D: 2 long answer questions (5 marks each).
- Section E: 1 case-based question (4 marks) with a short passage from the chapter's content and 3 sub-questions.
Show the marks next to each question. Then a heading "Answer key" with the answer to every question, written the way a CBSE marking scheme expects (key points that earn the marks).`,
  },
  important: {
    label: 'Important questions', hint: 'Likely board questions with model answers', menu: true,
    prompt: (s) => `${base(s)}
${read}
List the questions most likely to be asked in the CBSE board exam from this chapter, grouped as 1-mark, 2-mark, 3-mark and 5-mark questions (4 to 6 in each group).
Give each a model answer whose length matches its marks, in the style of the CBSE marking scheme.`,
  },
  ncert: {
    label: 'NCERT solutions', hint: 'Answers to in-text and exercise questions', menu: true,
    prompt: (s) => `${base(s)}
${read}
Find every in-text question and every end-of-chapter exercise question in the text. For each one, quote the question in bold, then answer it step by step.
For numericals, show the given values, the formula, the working and the final answer with units. If the chapter text has no questions, say so.`,
  },
  summary: {
    label: 'Book summary', hint: 'Every chapter in one place', menu: false,
    prompt: (s) => `${base(s)}
Below are notes for every chapter of one textbook. Write a whole-book summary: for each chapter, a short heading and the 5 to 8 most important ideas, then a final section linking ideas that connect across chapters.`,
  },
  custom: {
    label: 'Your own request', hint: 'Ask for anything, in your words', menu: false,
    prompt: (s) => `${base(s)}\n${read}\nDo exactly what the student asks below, using only this chapter.`,
  },
};
