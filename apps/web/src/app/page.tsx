import { BookOpen, MessageSquareText, Sparkles, Users } from 'lucide-react';
import { Container } from '@/components/container';

const DOMAINS = [
  {
    icon: BookOpen,
    title: 'Language',
    description:
      'Grammar, vocabulary, listening, writing, professional English and speaking fluency.',
  },
  {
    icon: MessageSquareText,
    title: 'Communication',
    description:
      'Public speaking, presentations, business communication, active listening and negotiation.',
  },
  {
    icon: Users,
    title: 'Leadership',
    description:
      'Decision-making, teamwork, conflict resolution, emotional intelligence and team management.',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="py-16 sm:py-24">
        <Container>
          <p className="text-support font-medium text-secondary">
            Self-paced learning with a personal AI mentor
          </p>
          <h1 className="mt-3 max-w-3xl text-h1 font-semibold tracking-tight sm:text-display">
            Build the language, communication and leadership skills that move your career forward.
          </h1>
          <p className="mt-4 max-w-2xl text-body text-fg-muted">
            Structured courses, practice you can measure, and a mentor that knows what you&apos;re
            learning. Courses open soon.
          </p>
        </Container>
      </section>

      <section id="domains" aria-labelledby="domains-heading" className="scroll-mt-20 pb-16">
        <Container>
          <h2 id="domains-heading" className="text-h2 font-semibold">
            Three learning domains
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DOMAINS.map(({ icon: Icon, title, description }) => (
              <li key={title} className="glass-panel p-6">
                <Icon aria-hidden className="size-6 text-primary" />
                <h3 className="mt-4 text-h3 font-semibold">{title}</h3>
                <p className="mt-2 text-support text-fg-muted">{description}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section id="mentor" aria-labelledby="mentor-heading" className="scroll-mt-20 pb-24">
        <Container>
          <div className="glass-panel flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:p-8">
            <Sparkles aria-hidden className="size-6 shrink-0 text-secondary" />
            <div>
              <h2 id="mentor-heading" className="text-h2 font-semibold">
                A private AI mentor for every learner
              </h2>
              <p className="mt-2 max-w-2xl text-body text-fg-muted">
                Ask about a lesson, practise a conversation or get feedback on your writing. Answers
                draw on the courses you&apos;re enrolled in and are always labelled as AI-generated.
              </p>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
