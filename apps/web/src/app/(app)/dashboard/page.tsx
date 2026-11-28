import type { Metadata } from 'next';
import { Welcome } from './welcome';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return <Welcome />;
}
