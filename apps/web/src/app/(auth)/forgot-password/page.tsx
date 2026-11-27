import type { Metadata } from 'next';
import { ForgotPassword } from './forgot-password';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
