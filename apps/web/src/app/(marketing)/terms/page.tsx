import type { Metadata } from 'next';
import { DraftLegalPage } from '@/components/draft-legal-page';

export const metadata: Metadata = { title: 'Terms of use' };

export default function TermsPage() {
  return (
    <DraftLegalPage title="Terms of use">
      <p>
        These terms will describe how you may use Luminai, what we provide and what we ask of you.
      </p>
      <h2>Your account</h2>
      <p>
        Keep your password private. You are responsible for activity on your account. You can sign
        out of other devices at any time from Settings.
      </p>
      <h2>Learning content and AI feedback</h2>
      <p>
        Courses, assessments and mentor replies are for learning. AI feedback can be wrong; it is
        not professional, legal or medical advice.
      </p>
    </DraftLegalPage>
  );
}
