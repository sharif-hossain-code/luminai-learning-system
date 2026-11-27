import type { Metadata } from 'next';
import { DraftLegalPage } from '@/components/draft-legal-page';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return (
    <DraftLegalPage title="Privacy policy">
      <p>
        This policy will explain what personal data Luminai collects, why, and how long we keep it.
      </p>
      <h2>What we store</h2>
      <p>
        Your email address, a hashed password, your profile and learning preferences, and the
        devices you are signed in on (browser and operating system, not location).
      </p>
      <h2>Security records</h2>
      <p>
        We keep a log of security events such as sign-ins and password changes. IP addresses in that
        log are stored only as keyed hashes.
      </p>
    </DraftLegalPage>
  );
}
