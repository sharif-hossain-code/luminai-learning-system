import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Container } from '@/components/container';
import { fetchApiStatus } from '@/lib/api-health';

export const metadata: Metadata = { title: 'System status' };

export default function StatusPage() {
  return (
    <Container className="py-12">
      <h1 className="text-h1 font-semibold">System status</h1>
      <p className="mt-2 text-fg-muted">Live readiness of the API and its dependencies.</p>
      <Suspense fallback={<p className="mt-6 text-fg-muted">Checking the API…</p>}>
        <ApiStatusCard />
      </Suspense>
    </Container>
  );
}

async function ApiStatusCard() {
  await connection(); // always check at request time, never at build time
  const status = await fetchApiStatus();

  if (!status.reachable) {
    return (
      <p role="status" className="glass-panel mt-6 p-6 text-danger-text">
        The API is not reachable. Start it with <code className="font-mono">pnpm dev</code>.
      </p>
    );
  }

  const { readiness } = status;
  const rows = [
    { name: 'Database', state: readiness.checks.database },
    { name: 'Redis', state: readiness.checks.redis },
  ];

  return (
    <div role="status" className="glass-panel mt-6 p-6">
      <p className="text-h3 font-semibold">
        API {readiness.status === 'ready' ? 'is ready' : 'is degraded'}
      </p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-support">
        {rows.map((row) => (
          <div key={row.name} className="contents">
            <dt className="text-fg-muted">{row.name}</dt>
            <dd className={row.state === 'up' ? 'text-success-text' : 'text-danger-text'}>
              {row.state === 'up' ? 'Up' : 'Down'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
