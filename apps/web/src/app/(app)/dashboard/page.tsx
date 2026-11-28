import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SuggestedCourses } from './suggested-courses';
import { Welcome } from './welcome';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <Welcome>
      <Suspense fallback={<div className="mt-8 h-72 animate-pulse rounded-lg bg-subtle" />}>
        <SuggestedCourses />
      </Suspense>
    </Welcome>
  );
}
