import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from '@phosphor-icons/react';
import { loadSettings, saveSettings, testClaudeKey } from '../lib/ai.js';
import { Alert, Button, Field } from '../ui.jsx';

const OPTIONS = [
  { value: 'local', label: 'Local AI (free)', hint: 'Runs on this computer with Ollama. Reads the text of each page; nothing leaves your computer.' },
  { value: 'claude', label: 'Claude (your API key)', hint: 'Reads the chapter PDFs directly, including diagrams and scanned pages, and can make Premium PDFs. Billed to your Anthropic account.' },
];

export default function Settings() {
  const [s, setS] = useState(loadSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function save(e) {
    e.preventDefault();
    setError(''); setOk('');
    const key = s.claudeKey.trim();
    if (s.provider === 'claude' && !key) return setError('Paste your Claude API key to use Claude.');
    if (key) {
      setBusy(true);
      try { await testClaudeKey(key); } catch (err) { setBusy(false); return setError(err.message); }
      setBusy(false);
    }
    saveSettings({ ...s, claudeKey: key });
    setOk(key ? 'Saved. Your Claude key works.' : 'Saved.');
  }

  function removeKey() {
    const next = { provider: 'local', claudeKey: '' };
    saveSettings(next); setS(next); setOk('Claude key removed from this browser.'); setError('');
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        <ArrowLeft size={16} /> Your books
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">AI settings</h1>
      <form onSubmit={save} className="mt-8 grid gap-6">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Which AI writes your notes?</legend>
          {OPTIONS.map((o) => (
            <label key={o.value} className={`flex cursor-pointer gap-3 rounded-[10px] border p-4 ${s.provider === o.value ? 'border-accent bg-accent/10' : 'border-zinc-200 dark:border-zinc-800'}`}>
              <input type="radio" name="provider" value={o.value} checked={s.provider === o.value} onChange={() => setS({ ...s, provider: o.value })}
                className="mt-1 accent-[var(--color-accent)]" />
              <span>
                <span className="block font-medium">{o.label}</span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-400">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Field label="Claude API key" name="claudeKey" type="password" autoComplete="off" value={s.claudeKey}
          onChange={(e) => setS({ ...s, claudeKey: e.target.value })} placeholder="sk-ant-..."
          hint="Create one at console.anthropic.com. It is stored only in this browser and sent only to Anthropic." />
        <Alert>{error}</Alert>
        <Alert kind="ok">{ok}</Alert>
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy}>{busy ? 'Checking key…' : 'Save'}</Button>
          {loadSettings().claudeKey && <Button type="button" variant="secondary" onClick={removeKey}>Remove key</Button>}
        </div>
      </form>
    </main>
  );
}
