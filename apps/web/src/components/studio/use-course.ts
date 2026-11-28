'use client';

import { adminCourseSchema, type AdminCourse, type FieldError } from '@luminai/contracts';
import { useCallback, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api-client';

export type Notice = { tone: 'success' | 'danger'; message: string } | null;

/**
 * Holds the course being edited. Every authoring endpoint answers with the whole
 * updated course, so a mutation simply replaces the state with the response.
 */
export function useCourse(initial: AdminCourse) {
  const [course, setCourse] = useState(initial);
  // Next keeps visited pages mounted, so coming back after editing a lesson brings
  // fresh server data in `initial`. Take it when it is newer than what we hold.
  const [seenRevision, setSeenRevision] = useState(initial.draftRevision);
  if (initial.draftRevision !== seenRevision) {
    setSeenRevision(initial.draftRevision);
    if (initial.draftRevision > course.draftRevision) setCourse(initial);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const mutate = useCallback(
    async (
      key: string,
      path: string,
      init: { method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown },
      options: { success?: string; onFieldErrors?: (errors: FieldError[]) => void } = {},
    ): Promise<AdminCourse | null> => {
      setBusy(key);
      setNotice(null);
      try {
        const data = await apiFetch(path, {
          method: init.method,
          ...(init.body !== undefined ? { body: init.body } : {}),
        });
        const next = adminCourseSchema.parse(data);
        setCourse(next);
        if (options.success) setNotice({ tone: 'success', message: options.success });
        return next;
      } catch (caught) {
        if (caught instanceof ApiError && caught.fieldErrors.length && options.onFieldErrors) {
          options.onFieldErrors(caught.fieldErrors);
        }
        setNotice({
          tone: 'danger',
          message:
            caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
        });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  return { course, setCourse, busy, notice, setNotice, mutate };
}

/** One entry per line, blank lines dropped. */
export const linesToList = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
