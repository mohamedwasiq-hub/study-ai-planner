// Which AI writes the notes: the local model (Ollama, free) or Claude with the student's own API key.
// The Claude key is kept only in this browser and sent straight to Anthropic; our server never sees it.
import Anthropic from '@anthropic-ai/sdk';
import { ask, maxInputChars, pickModel } from './localai.js';

const KEY = 'aiSettings';
const CLAUDE_MODEL = 'claude-opus-5-5';

export function loadSettings() {
  try { return { provider: 'local', claudeKey: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { provider: 'local', claudeKey: '' }; }
}
export const saveSettings = (s) => localStorage.setItem(KEY, JSON.stringify(s));
export const hasClaude = () => !!loadSettings().claudeKey;

const client = (key) => new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });

// Turns SDK errors into sentences a student can act on.
function friendly(e) {
  if (e instanceof Anthropic.AuthenticationError) return new Error('Your Claude API key was rejected. Check it in Settings.');
  if (e instanceof Anthropic.PermissionDeniedError) return new Error('Your Claude API key is not allowed to do this. Check your Anthropic Console.');
  if (e instanceof Anthropic.RateLimitError) return new Error('Claude is rate-limiting your key. Wait a minute and try again.');
  if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) return new Error('Your Anthropic account has no credit left.');
  if (e instanceof Anthropic.APIError) return new Error(`Claude error ${e.status ?? ''}: ${e.message}`);
  return e;
}

export async function testClaudeKey(key) {
  try { await client(key).models.retrieve(CLAUDE_MODEL); } catch (e) { throw friendly(e); }
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

async function claudeAsk(key, content, onProgress) {
  try {
    const stream = client(key).beta.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 64000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // if Opus declines, the API re-runs on a suitable model instead of failing
      messages: [{ role: 'user', content }],
    });
    let words = 0;
    stream.on('text', (t) => { words += t.split(/\s+/).filter(Boolean).length; onProgress?.(words); });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('Claude declined to write this. Try different chapters or wording.');
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (!text.trim()) throw new Error('Claude returned nothing. Try again.');
    return msg.stop_reason === 'max_tokens' ? `${text}\n\n> These notes hit the length limit and may be cut off at the end.` : text;
  } catch (e) { throw friendly(e); }
}

// One interface for both AIs. askPdf exists only for Claude, which reads the chapter PDF itself (diagrams included).
export async function startEngine() {
  const s = loadSettings();
  if (s.provider === 'claude' && s.claudeKey) {
    return {
      provider: 'claude',
      name: 'Claude (your API key)',
      maxChars: 1_500_000,
      ask: (prompt, onProgress) => claudeAsk(s.claudeKey, [{ type: 'text', text: prompt }], onProgress),
      askPdf: async (pdfBlob, prompt, onProgress) => claudeAsk(s.claudeKey, [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await blobToBase64(pdfBlob) } },
        { type: 'text', text: prompt },
      ], onProgress),
    };
  }
  const model = await pickModel();
  return { provider: 'local', name: model.name, maxChars: maxInputChars(model), ask: (prompt, onProgress) => ask(model, prompt, onProgress) };
}

// Premium PDF: Anthropic's PDF Agent Skill typesets the notes in a code sandbox and returns the file.
export async function premiumPdf(markdown, title) {
  const c = client(loadSettings().claudeKey);
  const params = {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    container: { skills: [{ type: 'anthropic', skill_id: 'pdf', version: 'latest' }] },
    tools: [{ type: 'code_execution_20260521', name: 'code_execution' }],
    betas: ['code-execution-2025-08-25'],
  };
  const messages = [{
    role: 'user',
    content: `Typeset these study notes as a polished A4 PDF named notes.pdf, titled "${title}". Keep every word of the content. ` +
      'Use clear headings, bullet lists, real tables, and properly rendered maths and chemical equations (the notes write them in LaTeX between $ signs). ' +
      'If the text has Devanagari (Hindi), use a font that supports it. Draw any Mermaid mind map as a simple tree diagram.\n\n' + markdown,
  }];
  try {
    let res = await c.beta.messages.create({ ...params, messages });
    for (let i = 0; i < 5 && res.stop_reason === 'pause_turn'; i++) {
      res = await c.beta.messages.create({ ...params, container: { id: res.container?.id, ...params.container }, messages: [...messages, { role: 'assistant', content: res.content }] });
    }
    if (res.stop_reason === 'refusal') throw new Error('Claude declined to make this PDF.');
    const fileIds = res.content
      .filter((b) => b.type === 'bash_code_execution_tool_result' && b.content?.type === 'bash_code_execution_result')
      .flatMap((b) => b.content.content.filter((f) => f.type === 'bash_code_execution_output').map((f) => f.file_id));
    for (const id of fileIds.reverse()) {
      const meta = await c.files.retrieveMetadata(id);
      if (/\.pdf$/i.test(meta.filename)) return await (await c.files.download(id)).blob();
    }
    throw new Error('Claude finished without producing a PDF. Try again.');
  } catch (e) { throw friendly(e); }
}
