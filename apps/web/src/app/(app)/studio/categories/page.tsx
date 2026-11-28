import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CategoryManager } from '@/components/studio/category-manager';
import { getCurrentUser } from '@/lib/session';
import { getStudioCategories } from '@/lib/studio-data';

export const metadata: Metadata = { title: 'Categories' };

async function Categories() {
  const user = await getCurrentUser();
  if (user?.role !== 'ADMIN') notFound();
  return <CategoryManager categories={await getStudioCategories()} />;
}

export default function CategoriesPage() {
  return (
    <Suspense
      fallback={
        <div role="status" className="h-96 animate-pulse rounded-lg bg-subtle">
          <span className="sr-only">Loading categories…</span>
        </div>
      }
    >
      <Categories />
    </Suspense>
  );
}
