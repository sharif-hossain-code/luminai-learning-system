import { HttpStatus, Injectable } from '@nestjs/common';
import {
  courseSnapshotSchema,
  ErrorCode,
  MEDIA_FINISHED_PERCENT,
  type CourseSnapshot,
  type EnrolledCourse,
  type Enrollment,
  type LearnerCourse,
  type LearnerLesson,
  type LessonProgress,
  type LessonProgressResult,
  type UpdateLessonProgressRequest,
  type UpNextAssessment,
} from '@luminai/contracts';
import { CourseStatus, EnrollmentStatus, Prisma } from '@luminai/database';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { buildJourney, type AssessmentRow, type Journey } from './journey.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = (what = 'Course') =>
  new AppError(ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND, `${what} not found.`);
const notEnrolled = () =>
  new AppError(
    ErrorCode.NOT_ENROLLED,
    HttpStatus.FORBIDDEN,
    'Enrol in this course to open its lessons.',
  );

const courseSelect = {
  id: true,
  slug: true,
  status: true,
  publishedVersionId: true,
} satisfies Prisma.CourseSelect;

const versionSelect = {
  id: true,
  version: true,
  snapshot: true,
  category: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.CourseVersionSelect;

type CourseRow = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;
type EnrollmentRow = Prisma.EnrollmentGetPayload<object>;
type VersionRow = Prisma.CourseVersionGetPayload<{ select: typeof versionSelect }>;

export interface LoadedEnrollment {
  enrollment: EnrollmentRow;
  course: CourseRow;
  version: VersionRow;
  snapshot: CourseSnapshot;
  rows: ProgressRowFull[];
  assessmentRows: AssessmentRow[];
  journey: Journey;
}

/** Summarises a learner's attempts per assessment for the journey rules. */
export function summariseAttempts(
  attempts: readonly { assessmentId: string; status: string; passed: boolean | null }[],
): AssessmentRow[] {
  const rows = new Map<string, AssessmentRow>();
  for (const attempt of attempts) {
    const row = rows.get(attempt.assessmentId) ?? {
      assessmentId: attempt.assessmentId,
      passed: false,
      attemptsUsed: 0,
      open: false,
    };
    if (attempt.status === 'IN_PROGRESS') row.open = true;
    else {
      row.attemptsUsed += 1;
      if (attempt.passed) row.passed = true;
    }
    rows.set(attempt.assessmentId, row);
  }
  return [...rows.values()];
}

const attemptSummarySelect = {
  assessmentId: true,
  status: true,
  passed: true,
} satisfies Prisma.AssessmentAttemptSelect;

type ProgressRowFull = Prisma.LessonProgressGetPayload<object>;

/** A course is live when it has a published version and isn't archived. */
const isLive = (course: CourseRow) =>
  course.status !== CourseStatus.ARCHIVED && course.publishedVersionId !== null;

/**
 * Learners follow the live version. When a course is archived, enrolled learners
 * keep the version they were following.
 */
const effectiveVersionId = (course: CourseRow, enrollment: EnrollmentRow) =>
  isLive(course) ? course.publishedVersionId! : enrollment.courseVersionId;

function toEnrollment(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    courseId: row.courseId,
    status: row.status,
    enrolledAt: row.enrolledAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastActivityAt: row.lastActivityAt.toISOString(),
  };
}

function toLessonProgress(row: ProgressRowFull | undefined): LessonProgress {
  if (!row) {
    return {
      state: 'NOT_STARTED',
      progressPercent: 0,
      positionSeconds: null,
      startedAt: null,
      completedAt: null,
      updatedAt: null,
    };
  }
  return {
    state: row.status,
    progressPercent: row.progressPercent,
    positionSeconds: row.positionSeconds,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function header(course: CourseRow, version: VersionRow, snapshot: CourseSnapshot) {
  return {
    id: course.id,
    slug: course.slug,
    title: snapshot.course.title,
    summary: snapshot.course.summary,
    category: version.category,
    level: snapshot.course.level,
    estimatedMinutes: snapshot.course.estimatedMinutes,
    version: version.version,
  };
}

/** JSON that `snapshot @> ...` matches when the snapshot contains the lesson. */
const containsLesson = (lessonId: string) =>
  JSON.stringify({ modules: [{ lessons: [{ id: lessonId }] }] });

/** JSON that `snapshot @> ...` matches when the snapshot contains the assessment. */
const containsAssessment = (assessmentId: string) =>
  JSON.stringify({ assessments: [{ id: assessmentId }] });

/**
 * Enrolment, lesson access and progress. The learner always comes from the
 * session; nothing here takes a user id from the client. Every lesson read and
 * progress write checks enrolment and module locks on the server.
 */
@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Enrolment ----------

  /** Enrols the learner. Idempotent: an existing enrolment is returned, a withdrawn one reactivated. */
  async enrol(
    userId: string,
    courseId: string,
  ): Promise<{ enrollment: Enrollment; created: boolean }> {
    const course = await this.prisma.client.course.findUnique({
      where: { id: courseId },
      select: courseSelect,
    });
    if (!course || !isLive(course)) throw notFound();

    const existing = await this.prisma.client.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing)
      return { enrollment: toEnrollment(await this.reactivate(existing)), created: false };

    try {
      const created = await this.prisma.client.enrollment.create({
        data: { userId, courseId, courseVersionId: course.publishedVersionId! },
      });
      return { enrollment: toEnrollment(created), created: true };
    } catch (error) {
      // A concurrent request (double click, retry) enrolled first: the unique
      // constraint on (user, course) holds, and the result is the same enrolment.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const row = await this.prisma.client.enrollment.findUniqueOrThrow({
          where: { userId_courseId: { userId, courseId } },
        });
        return { enrollment: toEnrollment(row), created: false };
      }
      throw error;
    }
  }

  private async reactivate(row: EnrollmentRow): Promise<EnrollmentRow> {
    if (row.status !== EnrollmentStatus.WITHDRAWN) return row;
    return this.prisma.client.enrollment.update({
      where: { id: row.id },
      data: { status: EnrollmentStatus.ACTIVE, lastActivityAt: new Date() },
    });
  }

  // ---------- Reading ----------

  async learnerCourse(userId: string, idOrSlug: string): Promise<LearnerCourse> {
    const course = await this.prisma.client.course.findFirst({
      where: UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug.toLowerCase() },
      select: courseSelect,
    });
    if (!course || course.publishedVersionId === null) throw notFound();
    const enrollment = await this.prisma.client.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
    });
    if (!enrollment || enrollment.status === EnrollmentStatus.WITHDRAWN) {
      // Archived courses are only visible to the learners already enrolled in them.
      throw isLive(course) ? notEnrolled() : notFound();
    }
    const loaded = await this.load(course, enrollment);
    return {
      ...header(loaded.course, loaded.version, loaded.snapshot),
      enrollment: toEnrollment(loaded.enrollment),
      progress: loaded.journey.progress,
      nextLesson: loaded.journey.nextLesson,
      modules: loaded.journey.modules,
      finalAssessments: loaded.journey.finalAssessments,
    };
  }

  async lesson(userId: string, lessonId: string): Promise<LearnerLesson> {
    const loaded = await this.loadForLesson(userId, lessonId);
    const { journey, snapshot, course } = loaded;
    const index = journey.lessons.findIndex((item) => item.lesson.id === lessonId);
    const placed = journey.lessons[index]!;
    this.assertUnlocked(journey, index);

    const previous = journey.lessons[index - 1];
    const stepIndex = journey.steps.findIndex(
      (step) => step.kind === 'LESSON' && step.lesson.id === lessonId,
    );
    const next = journey.steps[stepIndex + 1];
    const { lesson, module } = placed;
    return {
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      objectives: lesson.objectives,
      content: lesson.content,
      estimatedMinutes: lesson.estimatedMinutes,
      completionRule: lesson.completionRule,
      isRequired: placed.required,
      resources: lesson.resources.map((resource) => ({
        id: resource.id,
        type: resource.type,
        title: resource.title,
        // Uploaded files (storage keys) get signed URLs once media storage exists (A25).
        url: resource.externalUrl,
        mimeType: resource.mimeType,
      })),
      course: { id: course.id, slug: course.slug, title: snapshot.course.title },
      module: {
        id: module.id,
        title: module.title,
        number: placed.moduleNumber,
        lessonCount: module.lessons.length,
      },
      lessonNumber: placed.lessonNumber,
      previousLessonId: previous?.lesson.id ?? null,
      next: next
        ? next.kind === 'LESSON'
          ? { kind: 'LESSON', id: next.lesson.id, title: next.lesson.title, locked: next.locked }
          : {
              kind: 'ASSESSMENT',
              id: next.assessment.id,
              title: next.assessment.title,
              locked: next.locked,
            }
        : null,
      progress: toLessonProgress(loaded.rows.find((row) => row.lessonId === lessonId)),
    };
  }

  async myEnrollments(
    userId: string,
    filter?: 'in-progress' | 'completed',
  ): Promise<EnrolledCourse[]> {
    const status =
      filter === 'completed'
        ? EnrollmentStatus.COMPLETED
        : filter === 'in-progress'
          ? EnrollmentStatus.ACTIVE
          : { not: EnrollmentStatus.WITHDRAWN };
    const enrollments = await this.prisma.client.enrollment.findMany({
      where: { userId, status },
      include: {
        course: { select: courseSelect },
        lessons: true,
        attempts: { select: attemptSummarySelect },
      },
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    const versionIds = [...new Set(enrollments.map((e) => effectiveVersionId(e.course, e)))];
    const versions = new Map(
      (
        await this.prisma.client.courseVersion.findMany({
          where: { id: { in: versionIds } },
          select: versionSelect,
        })
      ).map((version) => [version.id, version]),
    );

    return enrollments.map(({ course, lessons, attempts, ...enrollment }) => {
      const version = versions.get(effectiveVersionId(course, enrollment))!;
      const snapshot = courseSnapshotSchema.parse(version.snapshot);
      const journey = buildJourney(
        snapshot,
        lessons,
        enrollment.lastLessonId,
        summariseAttempts(attempts),
      );
      return {
        ...header(course, version, snapshot),
        enrollment: toEnrollment(enrollment),
        progress: journey.progress,
        nextLesson: journey.nextLesson,
      };
    });
  }

  /** The most recently active unfinished course with something left to open. */
  async continueLearning(userId: string): Promise<EnrolledCourse | null> {
    const courses = await this.myEnrollments(userId, 'in-progress');
    return courses.find((course) => course.nextLesson !== null) ?? null;
  }

  /**
   * Dashboard "Up next": open, required assessments not passed yet (with attempts
   * left), across active courses, most recently active course first.
   */
  async upNext(userId: string, limit = 3): Promise<UpNextAssessment[]> {
    const enrollments = await this.prisma.client.enrollment.findMany({
      where: { userId, status: EnrollmentStatus.ACTIVE },
      include: {
        course: { select: courseSelect },
        lessons: true,
        attempts: { select: attemptSummarySelect },
      },
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
      take: 50,
    });
    if (!enrollments.length) return [];
    const versions = new Map(
      (
        await this.prisma.client.courseVersion.findMany({
          where: { id: { in: enrollments.map((e) => effectiveVersionId(e.course, e)) } },
          select: versionSelect,
        })
      ).map((version) => [version.id, version]),
    );
    const items: UpNextAssessment[] = [];
    for (const { course, lessons, attempts, ...enrollment } of enrollments) {
      const version = versions.get(effectiveVersionId(course, enrollment))!;
      const snapshot = courseSnapshotSchema.parse(version.snapshot);
      const journey = buildJourney(
        snapshot,
        lessons,
        enrollment.lastLessonId,
        summariseAttempts(attempts),
      );
      for (const item of journey.assessments) {
        if (!item.required || item.locked || item.passed || item.outOfAttempts) continue;
        items.push({
          id: item.assessment.id,
          title: item.assessment.title,
          questionCount: item.assessment.questions.length,
          estimatedMinutes: item.assessment.estimatedMinutes,
          inProgress: attempts.some(
            (a) => a.assessmentId === item.assessment.id && a.status === 'IN_PROGRESS',
          ),
          course: { id: course.id, slug: course.slug, title: snapshot.course.title },
        });
      }
    }
    return items.slice(0, limit);
  }

  // ---------- Progress ----------

  async saveProgress(
    userId: string,
    lessonId: string,
    body: UpdateLessonProgressRequest,
  ): Promise<LessonProgressResult> {
    const loaded = await this.loadForLesson(userId, lessonId);
    const index = loaded.journey.lessons.findIndex((item) => item.lesson.id === lessonId);
    this.assertUnlocked(loaded.journey, index);
    const { lesson } = loaded.journey.lessons[index]!;
    const stored = loaded.rows.find((row) => row.lessonId === lessonId);

    const percent = Math.max(stored?.progressPercent ?? 0, body.progressPercent ?? 0);
    const mediaDone = percent >= MEDIA_FINISHED_PERCENT;
    let complete: boolean;
    switch (lesson.completionRule) {
      case 'VIEW':
        complete = true;
        break;
      case 'MEDIA_FINISHED':
        if (body.completed && !mediaDone) {
          throw new AppError(
            ErrorCode.COMPLETION_RULE_NOT_MET,
            HttpStatus.UNPROCESSABLE_ENTITY,
            'Play the media to the end to complete this lesson.',
          );
        }
        complete = mediaDone;
        break;
      case 'MARK_COMPLETE':
        complete = body.completed === true;
        break;
    }

    const userEnrollment = loaded.enrollment;
    const now = new Date();
    // One atomic upsert. Progress only moves forward: the percentage keeps its
    // maximum and a completed lesson stays complete with its first completion
    // time, so retried or out-of-order writes (several tabs, flaky networks) are safe.
    const [row] = await this.prisma.client.$queryRaw<ProgressRowFull[]>`
      INSERT INTO lesson_progress AS lp
        (user_id, enrollment_id, lesson_id, status, progress_percent, position_seconds,
         started_at, completed_at, updated_at)
      VALUES (
        ${userId}::uuid, ${userEnrollment.id}::uuid, ${lessonId}::uuid,
        ${complete ? 'COMPLETED' : 'IN_PROGRESS'}::lesson_progress_status,
        ${complete && lesson.completionRule !== 'MEDIA_FINISHED' ? 100 : percent},
        ${body.positionSeconds ?? null}, ${now}, ${complete ? now : null}, ${now})
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        enrollment_id = EXCLUDED.enrollment_id,
        progress_percent = GREATEST(lp.progress_percent, EXCLUDED.progress_percent),
        position_seconds = COALESCE(EXCLUDED.position_seconds, lp.position_seconds),
        status = CASE WHEN lp.status = 'COMPLETED' OR EXCLUDED.status = 'COMPLETED'
                      THEN 'COMPLETED'::lesson_progress_status
                      ELSE 'IN_PROGRESS'::lesson_progress_status END,
        completed_at = COALESCE(lp.completed_at, EXCLUDED.completed_at),
        updated_at = EXCLUDED.updated_at
      RETURNING id, user_id AS "userId", enrollment_id AS "enrollmentId", lesson_id AS "lessonId",
        status, progress_percent AS "progressPercent", position_seconds AS "positionSeconds",
        started_at AS "startedAt", completed_at AS "completedAt",
        created_at AS "createdAt", updated_at AS "updatedAt"`;

    const rows = [...loaded.rows.filter((r) => r.lessonId !== lessonId), row!];
    const journey = buildJourney(loaded.snapshot, rows, lessonId, loaded.assessmentRows);
    const enrollment = await this.recordActivity(userEnrollment.id, journey, now, lessonId);

    return {
      lessonId,
      progress: toLessonProgress(row),
      course: {
        progress: journey.progress,
        enrollmentStatus: enrollment.status,
        completedAt: enrollment.completedAt?.toISOString() ?? null,
        nextLesson: journey.nextLesson,
      },
    };
  }

  /**
   * Notes the learner's activity and records course completion once: only an
   * ACTIVE enrolment moves to COMPLETED, so a later republish never undoes it.
   */
  async recordActivity(
    enrollmentId: string,
    journey: Journey,
    now: Date,
    lastLessonId?: string,
  ): Promise<EnrollmentRow> {
    let enrollment = await this.prisma.client.enrollment.update({
      where: { id: enrollmentId },
      data: { lastActivityAt: now, ...(lastLessonId ? { lastLessonId } : {}) },
    });
    if (journey.complete && enrollment.status === EnrollmentStatus.ACTIVE) {
      await this.prisma.client.enrollment.updateMany({
        where: { id: enrollment.id, status: EnrollmentStatus.ACTIVE },
        data: { status: EnrollmentStatus.COMPLETED, completedAt: now },
      });
      enrollment = await this.prisma.client.enrollment.findUniqueOrThrow({
        where: { id: enrollment.id },
      });
    }
    return enrollment;
  }

  // ---------- Loading ----------

  private assertUnlocked(journey: Journey, index: number): void {
    if (journey.lessons[index]!.locked) {
      throw new AppError(
        ErrorCode.LESSON_LOCKED,
        HttpStatus.FORBIDDEN,
        'Finish the earlier modules to open this lesson.',
      );
    }
  }

  /** The enrolment, version and progress for a course; moves the learner to the live version. */
  private async load(course: CourseRow, enrollment: EnrollmentRow): Promise<LoadedEnrollment> {
    const versionId = effectiveVersionId(course, enrollment);
    const [version, rows, attempts] = await Promise.all([
      this.prisma.client.courseVersion.findUniqueOrThrow({
        where: { id: versionId },
        select: versionSelect,
      }),
      this.prisma.client.lessonProgress.findMany({
        where: { userId: enrollment.userId, enrollmentId: enrollment.id },
      }),
      this.prisma.client.assessmentAttempt.findMany({
        where: { userId: enrollment.userId, enrollmentId: enrollment.id },
        select: attemptSummarySelect,
      }),
    ]);
    if (enrollment.courseVersionId !== versionId) {
      enrollment = await this.prisma.client.enrollment.update({
        where: { id: enrollment.id },
        data: { courseVersionId: versionId },
      });
    }
    const snapshot = courseSnapshotSchema.parse(version.snapshot);
    const assessmentRows = summariseAttempts(attempts);
    return {
      enrollment,
      course,
      version,
      snapshot,
      rows,
      assessmentRows,
      journey: buildJourney(snapshot, rows, enrollment.lastLessonId, assessmentRows),
    };
  }

  /**
   * Finds the learner's enrolment whose current version contains the lesson.
   * 403 NOT_ENROLLED when the lesson belongs to a live course they haven't joined,
   * 404 when it isn't part of any course they could open.
   */
  private loadForLesson(userId: string, lessonId: string): Promise<LoadedEnrollment> {
    return this.loadContaining(userId, containsLesson(lessonId), 'Lesson');
  }

  /** Like the lesson lookup: the learner's enrolment whose current version contains the assessment. */
  loadForAssessment(userId: string, assessmentId: string): Promise<LoadedEnrollment> {
    return this.loadContaining(userId, containsAssessment(assessmentId), 'Assessment');
  }

  /** Reloads an enrolment by id (for attempts, which know their enrolment). */
  async loadEnrollment(enrollmentId: string): Promise<LoadedEnrollment> {
    const enrollment = await this.prisma.client.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { course: { select: courseSelect } },
    });
    const { course, ...row } = enrollment;
    return this.load(course, row);
  }

  private async loadContaining(
    userId: string,
    needle: string,
    what: 'Lesson' | 'Assessment',
  ): Promise<LoadedEnrollment> {
    const [match] = await this.prisma.client.$queryRaw<{ id: string }[]>`
      SELECT e.id
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN course_versions v ON v.id = CASE
        WHEN c.status <> 'ARCHIVED'::course_status AND c.published_version_id IS NOT NULL
        THEN c.published_version_id ELSE e.course_version_id END
      WHERE e.user_id = ${userId}::uuid
        AND e.status <> 'WITHDRAWN'::enrollment_status
        AND v.snapshot @> ${needle}::jsonb
      LIMIT 1`;
    if (!match) {
      const [live] = await this.prisma.client.$queryRaw<{ id: string }[]>`
        SELECT c.id FROM courses c
        JOIN course_versions v ON v.id = c.published_version_id
        WHERE c.status <> 'ARCHIVED'::course_status AND v.snapshot @> ${needle}::jsonb
        LIMIT 1`;
      throw live ? notEnrolled() : notFound(what);
    }
    const enrollment = await this.prisma.client.enrollment.findUniqueOrThrow({
      where: { id: match.id },
      include: { course: { select: courseSelect } },
    });
    const { course, ...row } = enrollment;
    return this.load(course, row);
  }
}
