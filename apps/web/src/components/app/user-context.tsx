'use client';

import type { CurrentUser } from '@luminai/contracts';
import { createContext, useContext, type ReactNode } from 'react';

const UserContext = createContext<CurrentUser | null>(null);

export function UserProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return <UserContext value={user}>{children}</UserContext>;
}

/** The signed-in user. Only valid inside the (app) layout, which guarantees one. */
export function useCurrentUser(): CurrentUser {
  const user = useContext(UserContext);
  if (!user) throw new Error('useCurrentUser must be used inside the signed-in app layout.');
  return user;
}

export function initials(user: CurrentUser): string {
  const source = user.profile.displayName?.trim() || user.email;
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}
