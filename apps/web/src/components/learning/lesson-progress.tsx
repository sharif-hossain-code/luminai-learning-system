'use client';

import type {
  EnrollmentStatus,
  LessonProgress,
  LessonProgressResult,
  UpdateLessonProgressRequest,
} from '@luminai/contracts';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch } from '@/lib/api-client';

interface LessonProgressState {
  progress: LessonProgress;
  /** The course as of the latest save (null until the first save answers). */
  course: LessonProgressResult['course'] | null;
  /** The course was completed during this visit. */
  finishedCourse: boolean;
  save(body: UpdateLessonProgressRequest): Promise<LessonProgressResult>;
}

function sendProgress(lessonId: string, body: UpdateLessonProgressRequest) {
  return apiFetch<LessonProgressResult>(`/lessons/${lessonId}/progress`, { method: 'PUT', body });
}

const Context = createContext<LessonProgressState | null>(null);

export function useLessonProgress(): LessonProgressState {
  const value = useContext(Context);
  if (!value) throw new Error('useLessonProgress must be used inside LessonProgressProvider.');
  return value;
}

/**
 * Owns the open lesson's progress. Opening the lesson sends an empty progress
 * write, which records the start and the resume point (and completes "view"
 * lessons). When a lesson or the course changes state, the server-rendered
 * outline and header are refreshed.
 */
export function LessonProgressProvider({
  lessonId,
  initial,
  enrollmentStatus,
  children,
}: {
  lessonId: string;
  initial: LessonProgress;
  enrollmentStatus: EnrollmentStatus;
  children: ReactNode;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [course, setCourse] = useState<LessonProgressResult['course'] | null>(null);
  const [finishedCourse, setFinishedCourse] = useState(false);
  const state = useRef({ lesson: initial.state, enrollment: enrollmentStatus });

  const apply = useCallback(
    (result: LessonProgressResult) => {
      setProgress(result.progress);
      setCourse(result.course);
      const changed =
        result.progress.state !== state.current.lesson ||
        result.course.enrollmentStatus !== state.current.enrollment;
      if (state.current.enrollment === 'ACTIVE' && result.course.enrollmentStatus === 'COMPLETED') {
        setFinishedCourse(true);
      }
      state.current = { lesson: result.progress.state, enrollment: result.course.enrollmentStatus };
      if (changed) router.refresh();
      return result;
    },
    [router],
  );

  const save = useCallback(
    (body: UpdateLessonProgressRequest) => sendProgress(lessonId, body).then(apply),
    [lessonId, apply],
  );

  useEffect(() => {
    // Records the visit. Safe to repeat: progress writes are idempotent.
    sendProgress(lessonId, {})
      .then(apply)
      .catch(() => undefined);
  }, [lessonId, apply]);

  return <Context value={{ progress, course, finishedCourse, save }}>{children}</Context>;
}
