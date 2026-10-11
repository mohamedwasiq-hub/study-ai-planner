// Shared building blocks. One radius scale: inputs and buttons 10px, panels 16px.
export function Field({ label, hint, error, ...props }) {
  const id = props.id || props.name;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</label>
      {props.children ? (
        <select id={id} {...props} className={inputCls} />
      ) : (
        <input id={id} {...props} className={inputCls} />
      )}
      {hint && !error && <p className="text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>}
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

const inputCls =
  'h-11 w-full rounded-[10px] border border-zinc-300 bg-white px-3 text-base text-zinc-900 placeholder:text-zinc-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

export function Button({ variant = 'primary', className = '', ...props }) {
  const look = variant === 'primary'
    ? 'bg-accent text-white hover:bg-accent-strong dark:text-zinc-950'
    : 'border border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900';
  return (
    <button
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60 ${look} ${className}`}
    />
  );
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const look = kind === 'error'
    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
    : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
  return <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded-[10px] border px-3 py-2 text-sm ${look}`}>{children}</p>;
}

export function Logo() {
  return <span className="text-lg font-semibold tracking-tight">Study AI Planner</span>;
}
