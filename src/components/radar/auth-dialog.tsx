'use client';

/**
 * AuthDialog — sign in / create account for local ads.
 * On signup the API token is revealed once with a copy button (it is the
 * user's credential; login rotates it).
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import { saveAuth, type AuthUser } from '@/lib/auth-client';

type Mode = 'signin' | 'signup';

export function AuthDialog({
  open,
  onClose,
  initialMode = 'signin',
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setIssuedToken(null);
    }
  }, [open, initialMode]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const url = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
        const body =
          mode === 'signup' ? { email, password, name } : { email, password };
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null)) as {
          token?: string;
          user?: AuthUser;
          error?: string;
        } | null;
        if (!res.ok || !json?.token || !json.user) {
          throw new Error(json?.error ?? `HTTP ${res.status}`);
        }
        saveAuth(json.token, json.user);
        if (mode === 'signup') {
          // Show the token once before closing.
          setIssuedToken(json.token);
        } else {
          onClose();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [mode, email, password, name, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t('auth.title')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
        {issuedToken ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-[16px] font-semibold text-text">{t('auth.accountReady')}</h2>
            <p className="text-[13px] leading-relaxed text-muted">{t('auth.tokenExplanation')}</p>
            <div className="rounded-lg border border-border bg-raised p-3">
              <div className="micro text-faint">{t('auth.yourToken')}</div>
              <code className="mt-1.5 block break-all font-mono text-[12px] leading-relaxed text-text" dir="ltr">
                {issuedToken}
              </code>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issuedToken);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  /* clipboard unavailable */
                }
              }}
              className="flex h-10 items-center justify-center gap-2 rounded-md border border-border text-[13px] text-muted transition-colors hover:text-text"
            >
              {copied ? <Check className="size-4 text-signal" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? t('detail.copied') : t('auth.copyToken')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 items-center justify-center rounded-md bg-signal text-[14px] font-medium text-[#0B0E0C] transition-[filter] hover:brightness-110"
            >
              {t('auth.continue')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-text">{t('auth.title')}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="flex size-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:text-text"
              >
                ✕
              </button>
            </div>

            {/* Mode tabs */}
            <div className="mt-4 flex h-10 items-center rounded-md border border-border bg-raised p-0.5" role="tablist">
              {(
                [
                  { id: 'signin' as const, label: t('auth.signIn') },
                  { id: 'signup' as const, label: t('auth.signUp') },
                ]
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => {
                    setMode(id);
                    setError(null);
                  }}
                  className={`flex h-9 flex-1 items-center justify-center rounded font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                    mode === id ? 'bg-signal text-[#0B0E0C]' : 'text-muted hover:text-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
              {mode === 'signup' ? (
                <div>
                  <label htmlFor="auth-name" className="micro text-faint">{t('auth.name')}</label>
                  <input
                    id="auth-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    autoComplete="name"
                    className="mt-1.5 h-11 w-full rounded-md border border-border bg-raised px-3 text-[14px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
              ) : null}
              <div>
                <label htmlFor="auth-email" className="micro text-faint">{t('auth.email')}</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  dir="ltr"
                  className="mt-1.5 h-11 w-full rounded-md border border-border bg-raised px-3 text-[14px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>
              <div>
                <label htmlFor="auth-password" className="micro text-faint">{t('auth.password')}</label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  dir="ltr"
                  className="mt-1.5 h-11 w-full rounded-md border border-border bg-raised px-3 text-[14px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                {mode === 'signup' ? (
                  <p className="mt-1 text-[11px] text-faint">{t('auth.passwordHint')}</p>
                ) : null}
              </div>
              {error ? (
                <p className="font-mono text-[12px] text-danger">{t('common.error')} — {error}</p>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex h-11 items-center justify-center rounded-md bg-signal text-[14px] font-medium text-[#0B0E0C] transition-[filter] hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
              >
                {busy ? t('common.loading') : mode === 'signup' ? t('auth.createAccount') : t('auth.signInCta')}
              </button>
              <p className="text-center text-[11px] leading-relaxed text-faint">{t('auth.termsNote')}</p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
