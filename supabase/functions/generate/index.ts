// POST { kind: 'chapter', chapterId } -> reads one whole chapter PDF and saves detailed notes.
// POST { kind: 'summary', bookId }    -> builds the book summary from the chapter notes.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { STYLES } from '../_shared/styles.ts';
import { gemini, QuotaError } from '../_shared/gemini.ts';

const DAILY_CAP = 25; // AI calls per student per day on the shared free key (a 15-chapter book is ~16 calls)
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') ?? '';
  // Acts as the student, so row-level security still applies to every read and write.
  const sb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = await sb.auth.getUser(auth.replace('Bearer ', ''));
  if (!user) return json({ error: 'Please log in again.' }, 401);

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json({ error: 'The AI is not set up yet (GEMINI_API_KEY secret missing).' }, 500);
  const { count } = (await admin.from('usage').select('count').eq('user_id', user.id).eq('day', today()).maybeSingle()).data ?? { count: 0 };
  // shortcut: check-then-count lets parallel calls slip past the cap by a few; the app sends calls one at a time.
  if (count >= DAILY_CAP) return json({ error: `Daily limit of ${DAILY_CAP} AI requests reached. It resets at midnight (UTC).`, cap: true }, 429);

  let body: { kind?: string; chapterId?: string; bookId?: string };
  try { body = await req.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const { data: profile } = await sb.from('profiles').select('class, stream, medium').eq('id', user.id).single();
  if (!profile?.class) return json({ error: 'Finish your profile first.' }, 400);

  try {
    if (body.kind === 'chapter') {
      const { data: ch } = await sb.from('chapters').select('id, book_id, number').eq('id', body.chapterId).single();
      if (!ch) return json({ error: 'Chapter not found.' }, 404);
      const { data: file, error } = await sb.storage.from('textbooks').download(`${user.id}/${ch.book_id}/${ch.number}.pdf`);
      if (error || !file) return json({ error: 'Chapter file is missing. Upload the book again.' }, 404);
      await sb.from('chapters').update({ status: 'reading' }).eq('id', ch.id);
      const md = await gemini(key, STYLES.detailed.prompt(profile), encodeBase64(new Uint8Array(await file.arrayBuffer())));
      await admin.rpc('bump_usage', { uid: user.id });
      await sb.from('notes').delete().eq('book_id', ch.book_id).eq('style', 'detailed').contains('chapter_ids', [ch.id]);
      const { data: note } = await sb.from('notes')
        .insert({ book_id: ch.book_id, chapter_ids: [ch.id], style: 'detailed', provider: 'gemini', content_md: md })
        .select('id').single();
      await sb.from('chapters').update({ status: 'done' }).eq('id', ch.id);
      return json({ noteId: note?.id });
    }

    if (body.kind === 'summary') {
      const { data: chapters } = await sb.from('chapters').select('id, number, title').eq('book_id', body.bookId).order('number');
      const { data: notes } = await sb.from('notes').select('chapter_ids, content_md').eq('book_id', body.bookId).eq('style', 'detailed');
      if (!chapters?.length || !notes?.length) return json({ error: 'Read the chapters first.' }, 400);
      const text = chapters.map((c) => {
        const n = notes.find((x) => x.chapter_ids.includes(c.id));
        return `# Chapter ${c.number}: ${c.title}\n\n${n?.content_md ?? '(not read yet)'}`;
      }).join('\n\n');
      const md = await gemini(key, `${STYLES.summary.prompt(profile)}\n\n${text}`);
      await admin.rpc('bump_usage', { uid: user.id });
      await sb.from('notes').delete().eq('book_id', body.bookId).eq('style', 'summary');
      await sb.from('notes').insert({ book_id: body.bookId, style: 'summary', provider: 'gemini', content_md: md });
      await sb.from('books').update({ status: 'done' }).eq('id', body.bookId);
      return json({ ok: true });
    }
    return json({ error: 'Unknown request.' }, 400);
  } catch (e) {
    if (body.kind === 'chapter') await sb.from('chapters').update({ status: 'error' }).eq('id', body.chapterId);
    if (e instanceof QuotaError) return json({ error: e.message, retry: true }, 429);
    return json({ error: (e as Error).message }, 502);
  }
});

const today = () => new Date().toISOString().slice(0, 10);
