// AI running on this computer through Ollama (free, nothing leaves the machine).
const OLLAMA = 'http://localhost:11434';
const OUTPUT_TOKENS = 8192;
const CHARS_PER_TOKEN = 3; // rough; errs toward a bigger context window

// Picks the biggest installed general model (coder models write poor notes).
export async function pickModel() {
  let res;
  try { res = await fetch(`${OLLAMA}/api/tags`); } catch {
    throw new Error('Local AI is not running. Start Ollama (it runs at localhost:11434) and try again.');
  }
  const { models = [] } = await res.json();
  const usable = models.filter((m) => !/coder|embed/i.test(m.name)).sort((a, b) => b.size - a.size);
  const m = usable[0] || models[0];
  if (!m) throw new Error('Ollama has no models. Run: ollama pull llama3.2');
  return { name: m.name, contextTokens: m.details?.context_length || 8192 };
}

// The most text one request can carry for this model, leaving room for the answer.
export const maxInputChars = (model) => Math.max(4000, (Math.min(model.contextTokens, 131072) - OUTPUT_TOKENS - 1024) * CHARS_PER_TOKEN);

// Sends one request and streams the answer; onProgress gets the word count so far.
export async function ask(model, prompt, onProgress) {
  const numCtx = Math.min(model.contextTokens, Math.ceil(prompt.length / CHARS_PER_TOKEN) + OUTPUT_TOKENS + 1024);
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({
      model: model.name,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      think: false,
      options: { num_ctx: numCtx, num_predict: OUTPUT_TOKENS, temperature: 0.3 },
    }),
  });
  if (!res.ok) throw new Error(`Local AI error: ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = '';
  let buf = '';
  let stop = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines.filter(Boolean)) {
      const msg = JSON.parse(line);
      if (msg.error) throw new Error(`Local AI error: ${msg.error}`);
      text += msg.message?.content || '';
      if (msg.done) stop = msg.done_reason;
    }
    onProgress?.(text.split(/\s+/).length);
  }
  if (!text.trim()) throw new Error('Local AI returned nothing. Try again, or pick a bigger model.');
  return stop === 'length' ? `${text}\n\n> These notes hit the length limit and may be cut off at the end.` : text;
}
