import type { Metadata } from 'next';
import { DraftLegalPage } from '@/components/draft-legal-page';

export const metadata: Metadata = { title: 'AI disclosure' };

export default function AiDisclosurePage() {
  return (
    <DraftLegalPage title="AI disclosure">
      <p>Luminai uses AI models to power the mentor, practice feedback and some assessments.</p>
      <h2>What the AI sees</h2>
      <p>
        The mentor uses the lesson you are on and your learning preferences to tailor replies. It
        does not see your password or payment details.
      </p>
      <h2>Limits</h2>
      <p>
        AI replies can be inaccurate. Scores from AI feedback are guidance, not formal grades,
        unless a course says otherwise.
      </p>
    </DraftLegalPage>
  );
}
