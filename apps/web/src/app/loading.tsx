import { Container } from '@/components/container';

export default function Loading() {
  return (
    <Container className="py-12">
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">Loading…</span>
        <div className="h-8 w-2/3 max-w-md animate-pulse rounded-md bg-subtle" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-subtle" />
        <div className="h-4 w-5/6 max-w-lg animate-pulse rounded-md bg-subtle" />
      </div>
    </Container>
  );
}
