import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckEmail } from './check-email';

export const metadata: Metadata = { title: 'Check your email' };

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmail />
    </Suspense>
  );
}
