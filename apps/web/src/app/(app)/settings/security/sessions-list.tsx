'use client';

import type { SessionSummary } from '@luminai/contracts';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SettingsSection } from '@/components/app/settings-tabs';
import { Alert, Pill } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api-client';

const MOBILE = /iPhone|iPad|Android|Mobile/i;

function lastActive(session: SessionSummary): string {
  if (session.current) return 'Active now';
  const seen = new Date(session.lastSeenAt ?? session.createdAt).getTime();
  const minutes = Math.round((Date.now() - seen) / 60_000);
  if (minutes < 5) return 'Active now';
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (minutes < 60) return `Last active ${format.format(-minutes, 'minute')}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last active ${format.format(-hours, 'hour')}`;
  return `Last active ${format.format(-Math.round(hours / 24), 'day')}`;
}

function signedInOn(session: SessionSummary): string {
  return `Signed in ${new Date(session.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

export function SessionsList() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Bumped to refetch after a change on this page or a password change elsewhere on it.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<SessionSummary[]>('/auth/sessions').then(
      (data) => {
        if (cancelled) return;
        setSessions(data);
        setError(null);
      },
      (caught: unknown) => {
        if (!cancelled)
          setError(caught instanceof ApiError ? caught.message : 'We couldn’t load your sessions.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    const reload = () => setVersion((value) => value + 1);
    window.addEventListener('luminai:sessions-changed', reload);
    return () => window.removeEventListener('luminai:sessions-changed', reload);
  }, []);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    try {
      await action();
      setVersion((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(null);
    }
  }

  const others = sessions?.filter((session) => !session.current).length ?? 0;

  return (
    <SettingsSection
      title="Active sessions"
      description="Devices currently signed in to your account. Sign out any you don't recognise."
    >
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      {sessions === null && !error ? (
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">Loading sessions…</span>
          {[0, 1].map((row) => (
            <div key={row} className="h-14 animate-pulse rounded-md bg-subtle" />
          ))}
        </div>
      ) : null}
      {sessions ? (
        <>
          <ul className="flex flex-col">
            {sessions.map((session) => {
              const Icon = MOBILE.test(session.device) ? Smartphone : Monitor;
              return (
                <li
                  key={session.id}
                  className="flex items-center gap-4 border-b border-subtle py-4 first:pt-0"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-fg-muted">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{session.device}</span>
                    <span className="block text-caption text-fg-muted">
                      {signedInOn(session)} · {lastActive(session)}
                    </span>
                  </span>
                  {session.current ? (
                    <Pill>This device</Pill>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy === session.id}
                      disabled={busy !== null}
                      onClick={() =>
                        run(session.id, () =>
                          apiFetch(`/auth/sessions/${session.id}`, { method: 'DELETE' }),
                        )
                      }
                      aria-label={`Sign out ${session.device}`}
                    >
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <p className="text-caption text-fg-muted">
              {sessions.length} active {sessions.length === 1 ? 'session' : 'sessions'}
            </p>
            {others > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                loading={busy === 'others'}
                disabled={busy !== null}
                onClick={() =>
                  run('others', () => apiFetch('/auth/sessions/revoke-others', { method: 'POST' }))
                }
              >
                <LogOut aria-hidden className="size-4" />
                Sign out everywhere else
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </SettingsSection>
  );
}
