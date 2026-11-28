import { Container } from '@/components/container';
import { Logo } from '@/components/logo';
import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main id="main-content" className="flex-1">
      <Container className="py-16">
        <Logo className="mb-10" />
        <h1 className="text-h1 font-semibold">Page not found</h1>
        <p className="mt-2 text-fg-muted">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <ButtonLink href="/" className="mt-6">
          Go to the home page
        </ButtonLink>
      </Container>
    </main>
  );
}
