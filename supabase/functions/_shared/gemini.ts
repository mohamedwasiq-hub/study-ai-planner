// Google Gemini (free tier). One call: optional PDF + instructions in, Markdown out.
export class QuotaError extends Error {}

const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest';

export async function gemini(key: string, prompt: string, pdfBase64?: string): Promise<string> {
  const parts: unknown[] = [];
  // shortcut: PDF sent inline (about 20 MB per request); chapters are far smaller. Use the Gemini File API if whole books ever go in one call.
  if (pdfBase64) parts.push({ inline_data: { mime_type: 'application/pdf', data: pdfBase64 } });
  parts.push({ text: prompt });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 32768, temperature: 0.3 } }),
  });
  if (res.status === 429) throw new QuotaError('The free AI quota is used up for the moment.');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Gemini error ${res.status}`);
  const cand = body.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
  if (!text) throw new Error(`Gemini returned no text (${cand?.finishReason || body.promptFeedback?.blockReason || 'unknown reason'}).`);
  if (cand.finishReason === 'MAX_TOKENS') return text + '\n\n> Notes were cut off at the length limit. Generate this chapter again in two parts if something is missing.';
  return text;
}
