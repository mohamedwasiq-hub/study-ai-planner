import { useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../lib/supabase.js';
import { Alert, Button, Field } from '../ui.jsx';

export default function Profile({ profile, onSaved }) {
  const nav = useNavigate();
  const [cls, setCls] = useState(String(profile.class || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true); setError('');
    const row = {
      name: f.name.trim(),
      class: Number(f.class),
      stream: Number(f.class) >= 11 ? f.stream : null,
      medium: f.medium,
      exam_date: f.exam_date || null,
    };
    const { error } = await supabase.from('profiles').update(row).eq('id', profile.id);
    setBusy(false);
    if (error) return setError(error.message);
    onSaved({ ...profile, ...row });
    nav('/');
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">About you</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">This tunes notes and questions to your class and board exam.</p>
      <form onSubmit={submit} className="mt-8 grid gap-5">
        <Field label="Name" name="name" defaultValue={profile.name || ''} required />
        <Field label="Class" name="class" value={cls} onChange={(e) => setCls(e.target.value)} required>
          <option value="" disabled>Choose your class</option>
          {[9, 10, 11, 12].map((n) => <option key={n} value={n}>Class {n}</option>)}
        </Field>
        {Number(cls) >= 11 && (
          <Field label="Stream" name="stream" defaultValue={profile.stream || 'Science'}>
            {['Science', 'Commerce', 'Humanities'].map((s) => <option key={s}>{s}</option>)}
          </Field>
        )}
        <Field label="Medium" name="medium" defaultValue={profile.medium || 'English'}>
          <option>English</option>
          <option>Hindi</option>
        </Field>
        <Field label="Board exam date" name="exam_date" type="date" defaultValue={profile.exam_date || ''}
          hint="Optional. Used later to build your study plan." />
        <Alert>{error}</Alert>
        <Button disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </form>
    </main>
  );
}
