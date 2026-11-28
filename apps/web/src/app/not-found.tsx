import Link from 'next/link';
import { Container } from '@/components/container';

export default function NotFound() {
  return (
    <Container className="py-16">
      <h1 className="text-h1 font-semibold">Page not found</h1>
      <p className="mt-2 text-fg-muted">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-medium text-primary-fg hover:opacity-90"
      >
        Go to the home page
      </Link>
    </Container>
  );
}
