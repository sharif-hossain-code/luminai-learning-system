'use client';

import {
  courseVersionSummarySchema,
  COURSE_LEVELS,
  LESSON_TYPES as LESSON_TYPE_VALUES,
  type AdminAssessment,
  type AdminCourse,
  type AdminModule,
  type FieldError,
  type LessonType,
  type PublishIssue,
} from '@luminai/contracts';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ClipboardList,
  Eye,
  History,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatDuration, LESSON_TYPES, LEVEL_LABELS, plural } from '@/lib/course-format';
import { QUESTION_TYPE_LABELS } from '@/lib/assessment-format';
import { ChangesBadge, StatusBadge } from './status-badge';
import { linesToList, useCourse, type Notice } from './use-course';

type Version = z.infer<typeof courseVersionSummarySchema>;
type Mutate = ReturnType<typeof useCourse>['mutate'];

// ---------- Small building blocks ----------

export function Card({
  title,
  description,
  action,
  children,
  id,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-6 rounded-lg border border-subtle bg-surface"
    >
      <div className="flex items-start justify-between gap-4 border-b border-subtle px-5 py-4 sm:px-6">
        <div>
          <h2 id={headingId} className="text-h3 font-semibold">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-support text-fg-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

export function TextArea({
  label,
  hint,
  error,
  rows = 3,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-support font-medium text-fg">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-message` : undefined}
        className="field-control min-h-0 resize-y py-2.5 leading-6"
        {...props}
      />
      {error ? (
        <p id={`${id}-message`} className="text-caption text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-message`} className="text-caption text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-35',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Two-step delete: the first press asks, the second (within 4 seconds) confirms. */
export function ConfirmDelete({
  label,
  onConfirm,
  disabled,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  if (armed) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-danger-subtle px-3 text-caption font-semibold text-danger-text"
      >
        <Trash2 aria-hidden className="size-4" />
        Confirm delete
      </button>
    );
  }
  return (
    <IconButton label={label} onClick={() => setArmed(true)} disabled={disabled}>
      <Trash2 aria-hidden className="size-4" />
    </IconButton>
  );
}

export function NoticeBar({ notice }: { notice: Notice }) {
  return (
    <div aria-live="polite">
      {notice ? (
        <Alert tone={notice.tone} className="mb-5">
          {notice.message}
        </Alert>
      ) : null}
    </div>
  );
}

// ---------- Details ----------

function fieldErrorsToMap(errors: FieldError[]) {
  return Object.fromEntries(errors.map((error) => [error.field.split('.')[0], error.message]));
}

function DetailsForm({
  course,
  categories,
  owners,
  mutate,
  busy,
}: {
  course: AdminCourse;
  categories: { id: string; name: string; isActive: boolean }[];
  owners: { id: string; label: string }[] | null;
  mutate: Mutate;
  busy: string | null;
}) {
  const initial = () => ({
    title: course.title,
    slug: course.slug,
    categoryId: course.category.id,
    level: course.level as string,
    hours: String(Math.floor(course.estimatedMinutes / 60)),
    minutes: String(course.estimatedMinutes % 60),
    summary: course.summary,
    description: course.description,
    outcomes: course.outcomes.join('\n'),
    prerequisites: course.prerequisites.join('\n'),
    keywords: course.keywords.join(', '),
    featuredRank: course.featuredRank ? String(course.featuredRank) : '',
    ownerId: course.owner.id,
  });
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedRevision, setSavedRevision] = useState(course.draftRevision);
  const set = (key: keyof ReturnType<typeof initial>) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Pick up server changes (e.g. after publish) when the form has no local edits.
  const dirty = JSON.stringify(form) !== JSON.stringify(initial());
  if (course.draftRevision !== savedRevision && !dirty) setSavedRevision(course.draftRevision);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const minutes = Number(form.hours || 0) * 60 + Number(form.minutes || 0);
    const body: Record<string, unknown> = {
      title: form.title,
      categoryId: form.categoryId,
      level: form.level,
      estimatedMinutes: Number.isFinite(minutes) ? minutes : 0,
      summary: form.summary,
      description: form.description,
      outcomes: linesToList(form.outcomes),
      prerequisites: linesToList(form.prerequisites),
      keywords: form.keywords
        .split(',')
        .map((word) => word.trim())
        .filter(Boolean),
    };
    if (!course.slugLocked) body.slug = form.slug;
    if (owners) {
      body.featuredRank = form.featuredRank ? Number(form.featuredRank) : null;
      body.ownerId = form.ownerId;
    }
    setErrors({});
    const next = await mutate(
      'details',
      `/admin/courses/${course.id}`,
      { method: 'PATCH', body },
      {
        success: 'Course details saved.',
        onFieldErrors: (fieldErrors) => setErrors(fieldErrorsToMap(fieldErrors)),
      },
    );
    if (next) {
      setSavedRevision(next.draftRevision);
      setForm({
        ...form,
        slug: next.slug,
        title: next.title,
        summary: next.summary,
        description: next.description,
      });
    }
  }

  return (
    <Card
      id="details"
      title="Course details"
      description="What learners see in the catalogue and on the course page."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <TextField
          label="Title"
          size="md"
          value={form.title}
          maxLength={120}
          error={errors.title}
          onChange={(event) => set('title')(event.target.value)}
        />
        <TextField
          label="Web address"
          size="md"
          value={form.slug}
          maxLength={80}
          readOnly={course.slugLocked}
          error={errors.slug}
          onChange={(event) => set('slug')(event.target.value)}
          hint={
            course.slugLocked
              ? `luminai.app/courses/${course.slug}. Locked after the first publish so links keep working.`
              : 'Lower-case letters, numbers and hyphens. It locks when the course is first published.'
          }
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Category"
            value={form.categoryId}
            error={errors.categoryId}
            onChange={(event) => set('categoryId')(event.target.value)}
            options={categories
              .filter((category) => category.isActive || category.id === course.category.id)
              .map((category) => ({ value: category.id, label: category.name }))}
          />
          <SelectField
            label="Level"
            value={form.level}
            onChange={(event) => set('level')(event.target.value)}
            options={COURSE_LEVELS.map((level) => ({ value: level, label: LEVEL_LABELS[level] }))}
          />
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-support font-medium">Estimated learning time</legend>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-support text-fg-muted">
              <input
                type="number"
                min={0}
                max={1000}
                inputMode="numeric"
                value={form.hours}
                onChange={(event) => set('hours')(event.target.value)}
                className="field-control h-11 w-20"
              />
              hours
            </label>
            <label className="flex items-center gap-2 text-support text-fg-muted">
              <input
                type="number"
                min={0}
                max={59}
                inputMode="numeric"
                value={form.minutes}
                onChange={(event) => set('minutes')(event.target.value)}
                className="field-control h-11 w-20"
              />
              minutes
            </label>
          </div>
          {errors.estimatedMinutes ? (
            <p className="text-caption text-danger-text">{errors.estimatedMinutes}</p>
          ) : null}
        </fieldset>
        <TextArea
          label="Summary"
          rows={2}
          maxLength={300}
          value={form.summary}
          error={errors.summary}
          onChange={(event) => set('summary')(event.target.value)}
          hint={`One or two sentences for the catalogue card. ${form.summary.length}/300`}
        />
        <TextArea
          label="Description"
          rows={5}
          maxLength={5000}
          value={form.description}
          error={errors.description}
          onChange={(event) => set('description')(event.target.value)}
          hint="Shown on the course page. Leave a blank line between paragraphs."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextArea
            label="Learning outcomes"
            rows={4}
            value={form.outcomes}
            error={errors.outcomes}
            onChange={(event) => set('outcomes')(event.target.value)}
            hint="One per line. Start each with a verb: “Write…”, “Lead…”."
          />
          <TextArea
            label="Prerequisites"
            rows={4}
            value={form.prerequisites}
            error={errors.prerequisites}
            onChange={(event) => set('prerequisites')(event.target.value)}
            hint="One per line. Leave empty if anyone can start."
          />
        </div>
        <TextField
          label="Search keywords"
          size="md"
          value={form.keywords}
          error={errors.keywords}
          onChange={(event) => set('keywords')(event.target.value)}
          hint="Comma-separated words learners might search for that aren’t in the title."
        />
        {owners ? (
          <div className="grid gap-5 rounded-md border border-dashed border-default p-4 sm:grid-cols-2">
            <SelectField
              label="Owner"
              value={form.ownerId}
              error={errors.ownerId}
              onChange={(event) => set('ownerId')(event.target.value)}
              options={owners.map((owner) => ({ value: owner.id, label: owner.label }))}
              hint="Content editors can only edit courses they own."
            />
            <TextField
              label="Featured position"
              size="md"
              type="number"
              min={1}
              max={1000}
              value={form.featuredRank}
              error={errors.featuredRank}
              onChange={(event) => set('featuredRank')(event.target.value)}
              hint="1 shows first in the catalogue. Leave empty to not feature it."
            />
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-3 border-t border-subtle pt-5">
          {dirty ? <span className="text-caption text-fg-muted">Unsaved changes</span> : null}
          <Button variant="ghost" disabled={!dirty} onClick={() => setForm(initial())}>
            Discard
          </Button>
          <Button type="submit" loading={busy === 'details'} disabled={!dirty}>
            Save details
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------- Curriculum ----------

function InlineForm({
  label,
  placeholder,
  withType,
  onSubmit,
  onCancel,
  busy,
  initialTitle = '',
  initialDescription,
  submitLabel = 'Add',
}: {
  label: string;
  placeholder: string;
  withType?: boolean;
  onSubmit: (values: { title: string; type: LessonType; description: string }) => void;
  onCancel: () => void;
  busy: boolean;
  initialTitle?: string;
  initialDescription?: string;
  submitLabel?: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [type, setType] = useState<LessonType>('TEXT');
  const [description, setDescription] = useState(initialDescription ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  return (
    <form
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) onSubmit({ title: title.trim(), type, description });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary-subtle/40 p-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          ref={inputRef}
          aria-label={`${label}: title`}
          placeholder={placeholder}
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          className="field-control h-10 flex-1"
        />
        {withType ? (
          <select
            aria-label="Lesson type"
            value={type}
            onChange={(event) => setType(event.target.value as LessonType)}
            className="field-control h-10 sm:w-44"
          >
            {LESSON_TYPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {LESSON_TYPES[value].label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {initialDescription !== undefined ? (
        <textarea
          aria-label={`${label}: description`}
          placeholder="Short description (optional)"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="field-control py-2"
        />
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function issuesFor(issues: PublishIssue[], path: string) {
  return issues.filter((issue) => issue.path === path);
}

const quizHref = (course: AdminCourse, assessment: AdminAssessment) =>
  `/studio/courses/${course.id}/assessments/${assessment.id}`;

/** A quiz in the curriculum list (Assessment.dc.html, 6). */
function QuizRow({ course, assessment }: { course: AdminCourse; assessment: AdminAssessment }) {
  const issues = issuesFor(course.publishIssues, `assessment:${assessment.id}`);
  const count = assessment.questions.length;
  const types = new Set(assessment.questions.map((question) => question.type));
  return (
    <li className="flex items-center gap-3 border-b border-subtle bg-warning-subtle/30 py-2 pr-3 pl-4 last:border-b-0 sm:pl-[60px]">
      <ClipboardList aria-hidden className="size-[18px] shrink-0 text-warning-text" />
      <Link
        href={quizHref(course, assessment)}
        className="min-w-0 flex-1 truncate rounded-sm py-1.5 text-body hover:text-primary hover:underline hover:underline-offset-4"
      >
        {assessment.title}
        <span className="sr-only">, quiz</span>
      </Link>
      {issues.length ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-subtle px-2 py-0.5 text-caption font-medium text-warning-text"
          title={issues.map((issue) => issue.message).join('\n')}
        >
          <AlertCircle aria-hidden className="size-3.5" />
          {plural(issues.length, 'issue')}
        </span>
      ) : null}
      <span
        className="hidden shrink-0 rounded-full bg-warning-subtle px-2.5 py-0.5 text-caption font-medium text-warning-text sm:inline"
        title={[...types].map((type) => QUESTION_TYPE_LABELS[type]).join(', ')}
      >
        Quiz · {plural(count, 'question')}
        {assessment.isRequired ? '' : ' · optional'}
      </span>
      <Link
        href={quizHref(course, assessment)}
        aria-label={`Edit ${assessment.title}`}
        title={`Edit ${assessment.title}`}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
      >
        <Pencil aria-hidden className="size-4" />
      </Link>
    </li>
  );
}

/** Adds a quiz (to a module, or a final assessment) and opens its editor. */
function AddQuizButton({
  course,
  moduleId,
  title,
  label,
  variant = 'ghost',
  mutate,
  busy,
}: {
  course: AdminCourse;
  moduleId: string | null;
  title: string;
  label: string;
  variant?: 'ghost' | 'secondary';
  mutate: Mutate;
  busy: string | null;
}) {
  const router = useRouter();
  const key = `quiz-in:${moduleId ?? 'course'}`;
  return (
    <Button
      variant={variant}
      size="sm"
      loading={busy === key}
      disabled={busy !== null && busy !== key}
      onClick={async () => {
        const before = new Set(course.assessments.map((item) => item.id));
        const next = await mutate(key, `/admin/courses/${course.id}/assessments`, {
          method: 'POST',
          body: { title, moduleId },
        });
        const created = next?.assessments.find((item) => !before.has(item.id));
        if (created) router.push(quizHref(course, created));
      }}
    >
      <Plus aria-hidden className="size-4" />
      {label}
    </Button>
  );
}

function ModuleCard({
  course,
  module,
  index,
  mutate,
  busy,
}: {
  course: AdminCourse;
  module: AdminModule;
  index: number;
  mutate: Mutate;
  busy: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const ids = course.modules.map((item) => item.id);
  const moduleIssues = issuesFor(course.publishIssues, `module:${module.id}`);

  function move(direction: -1 | 1) {
    const order = [...ids];
    order.splice(index, 1);
    order.splice(index + direction, 0, module.id);
    void mutate(`move:${module.id}`, `/admin/courses/${course.id}/module-order`, {
      method: 'PUT',
      body: { ids: order },
    });
  }

  function moveLesson(lessonIndex: number, direction: -1 | 1) {
    const order = module.lessons.map((lesson) => lesson.id);
    const [id] = order.splice(lessonIndex, 1);
    order.splice(lessonIndex + direction, 0, id!);
    void mutate(`move:${id}`, `/admin/modules/${module.id}/lesson-order`, {
      method: 'PUT',
      body: { ids: order },
    });
  }

  const minutes = module.lessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0);
  const quizzes = course.assessments.filter((assessment) => assessment.moduleId === module.id);

  return (
    <li className="rounded-lg border border-subtle bg-surface">
      <div className="flex items-start gap-3 p-4">
        <span
          aria-hidden
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-support font-semibold text-primary-strong"
        >
          {index + 1}
        </span>
        {editing ? (
          <div className="min-w-0 flex-1">
            <InlineForm
              label={`Edit module ${index + 1}`}
              placeholder="Module title"
              initialTitle={module.title}
              initialDescription={module.description}
              submitLabel="Save"
              busy={busy === `module:${module.id}`}
              onCancel={() => setEditing(false)}
              onSubmit={async ({ title, description }) => {
                const next = await mutate(`module:${module.id}`, `/admin/modules/${module.id}`, {
                  method: 'PATCH',
                  body: { title, description },
                });
                if (next) setEditing(false);
              }}
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <h3 className="text-body font-semibold">
              <span className="sr-only">Module {index + 1}: </span>
              {module.title}
            </h3>
            <p className="text-caption text-fg-muted">
              {plural(module.lessons.length, 'lesson')} · {formatDuration(minutes)}
              {module.description ? ` · ${module.description}` : ''}
            </p>
          </div>
        )}
        {!editing ? (
          <div className="flex shrink-0 items-center">
            <IconButton
              label={`Move ${module.title} up`}
              disabled={index === 0 || busy !== null}
              onClick={() => move(-1)}
            >
              <ArrowUp aria-hidden className="size-4" />
            </IconButton>
            <IconButton
              label={`Move ${module.title} down`}
              disabled={index === ids.length - 1 || busy !== null}
              onClick={() => move(1)}
            >
              <ArrowDown aria-hidden className="size-4" />
            </IconButton>
            <IconButton label={`Edit ${module.title}`} onClick={() => setEditing(true)}>
              <Pencil aria-hidden className="size-4" />
            </IconButton>
            <ConfirmDelete
              label={`Delete ${module.title}`}
              disabled={busy !== null}
              onConfirm={() =>
                void mutate(
                  `delete:${module.id}`,
                  `/admin/modules/${module.id}`,
                  { method: 'DELETE' },
                  {
                    success: 'Module deleted.',
                  },
                )
              }
            />
          </div>
        ) : null}
      </div>

      {moduleIssues.length ? (
        <p className="mx-4 mb-3 flex items-center gap-2 rounded-md bg-warning-subtle px-3 py-2 text-caption text-warning-text">
          <AlertCircle aria-hidden className="size-4 shrink-0" />
          Add at least one lesson before publishing.
        </p>
      ) : null}

      <ol className="border-t border-subtle">
        {module.lessons.map((lesson, lessonIndex) => {
          const type = LESSON_TYPES[lesson.type];
          const lessonIssues = issuesFor(course.publishIssues, `lesson:${lesson.id}`);
          return (
            <li
              key={lesson.id}
              className="group flex items-center gap-3 border-b border-subtle py-2 pr-3 pl-4 last:border-b-0 sm:pl-[60px]"
            >
              <type.icon aria-hidden className="size-[18px] shrink-0 text-fg-subtle" />
              <Link
                href={`/studio/courses/${course.id}/lessons/${lesson.id}`}
                className="min-w-0 flex-1 truncate rounded-sm py-1.5 text-body hover:text-primary hover:underline hover:underline-offset-4"
              >
                {lesson.title}
                <span className="sr-only">, {type.label}</span>
              </Link>
              {lessonIssues.length ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-subtle px-2 py-0.5 text-caption font-medium text-warning-text"
                  title={lessonIssues.map((issue) => issue.message).join('\n')}
                >
                  <AlertCircle aria-hidden className="size-3.5" />
                  {plural(lessonIssues.length, 'issue')}
                </span>
              ) : null}
              <span className="hidden shrink-0 text-caption text-fg-muted sm:inline">
                {lesson.estimatedMinutes ? formatDuration(lesson.estimatedMinutes) : '–'}
              </span>
              <span className="flex shrink-0 items-center">
                <IconButton
                  label={`Move ${lesson.title} up`}
                  disabled={lessonIndex === 0 || busy !== null}
                  onClick={() => moveLesson(lessonIndex, -1)}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </IconButton>
                <IconButton
                  label={`Move ${lesson.title} down`}
                  disabled={lessonIndex === module.lessons.length - 1 || busy !== null}
                  onClick={() => moveLesson(lessonIndex, 1)}
                >
                  <ArrowDown aria-hidden className="size-4" />
                </IconButton>
                <ConfirmDelete
                  label={`Delete ${lesson.title}`}
                  disabled={busy !== null}
                  onConfirm={() =>
                    void mutate(
                      `delete:${lesson.id}`,
                      `/admin/lessons/${lesson.id}`,
                      { method: 'DELETE' },
                      {
                        success: 'Lesson deleted.',
                      },
                    )
                  }
                />
              </span>
            </li>
          );
        })}
        {quizzes.map((assessment) => (
          <QuizRow key={assessment.id} course={course} assessment={assessment} />
        ))}
      </ol>
      <div className="flex flex-wrap gap-2 border-t border-subtle p-3 sm:pl-[60px]">
        {adding ? (
          <InlineForm
            label={`New lesson in ${module.title}`}
            placeholder="Lesson title"
            withType
            busy={busy === `lesson-in:${module.id}`}
            onCancel={() => setAdding(false)}
            onSubmit={async ({ title, type }) => {
              const next = await mutate(
                `lesson-in:${module.id}`,
                `/admin/modules/${module.id}/lessons`,
                {
                  method: 'POST',
                  body: { title, type },
                },
              );
              if (next) setAdding(false);
            }}
          />
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden className="size-4" />
              Add lesson
            </Button>
            <AddQuizButton
              course={course}
              moduleId={module.id}
              title={`Module ${index + 1} quiz`}
              label="Add quiz"
              mutate={mutate}
              busy={busy}
            />
          </>
        )}
      </div>
    </li>
  );
}

function FinalAssessments({
  course,
  mutate,
  busy,
}: {
  course: AdminCourse;
  mutate: Mutate;
  busy: string | null;
}) {
  const finals = course.assessments.filter((assessment) => assessment.moduleId === null);
  return (
    <section
      aria-labelledby="final-assessment-heading"
      className="mt-5 flex flex-col gap-3 rounded-lg border border-subtle p-4"
    >
      <div>
        <h3 id="final-assessment-heading" className="text-body font-semibold">
          Final assessment
        </h3>
        <p className="text-support text-fg-muted">
          Optional. A course-level quiz learners take after the last module.
        </p>
      </div>
      {finals.length ? (
        <ul className="overflow-hidden rounded-md border border-subtle [&>li]:sm:pl-4">
          {finals.map((assessment) => (
            <QuizRow key={assessment.id} course={course} assessment={assessment} />
          ))}
        </ul>
      ) : null}
      <div>
        <AddQuizButton
          course={course}
          moduleId={null}
          title="Final assessment"
          label="Add final assessment"
          variant="secondary"
          mutate={mutate}
          busy={busy}
        />
      </div>
    </section>
  );
}

function Curriculum({
  course,
  mutate,
  busy,
}: {
  course: AdminCourse;
  mutate: Mutate;
  busy: string | null;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Card
      id="curriculum"
      title="Curriculum"
      description="Modules, lessons and quizzes, in the order learners take them. Open a lesson or quiz to edit it."
    >
      {course.modules.length ? (
        <ol className="flex flex-col gap-3">
          {course.modules.map((module, index) => (
            <ModuleCard
              key={module.id}
              course={course}
              module={module}
              index={index}
              mutate={mutate}
              busy={busy}
            />
          ))}
        </ol>
      ) : (
        <p className="rounded-md border border-dashed border-default p-5 text-center text-support text-fg-muted">
          No modules yet. A module groups a few lessons around one skill.
        </p>
      )}
      <div className="mt-4">
        {adding ? (
          <InlineForm
            label="New module"
            placeholder="Module title, e.g. “Plan your talk”"
            busy={busy === 'add-module'}
            onCancel={() => setAdding(false)}
            onSubmit={async ({ title }) => {
              const next = await mutate('add-module', `/admin/courses/${course.id}/modules`, {
                method: 'POST',
                body: { title },
              });
              if (next) setAdding(false);
            }}
          />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" />
            Add module
          </Button>
        )}
      </div>
      <FinalAssessments course={course} mutate={mutate} busy={busy} />
    </Card>
  );
}

// ---------- Publishing ----------

function issueHref(course: AdminCourse, issue: PublishIssue): string {
  if (issue.path.startsWith('lesson:')) {
    return `/studio/courses/${course.id}/lessons/${issue.path.slice('lesson:'.length)}`;
  }
  if (issue.path.startsWith('assessment:')) {
    return `/studio/courses/${course.id}/assessments/${issue.path.slice('assessment:'.length)}`;
  }
  if (issue.path.startsWith('module:') || issue.path === 'course.modules') return '#curriculum';
  return '#details';
}

function PublishPanel({
  course,
  mutate,
  busy,
  onPublished,
}: {
  course: AdminCourse;
  mutate: Mutate;
  busy: string | null;
  onPublished: () => void;
}) {
  const router = useRouter();
  const ready = course.publishIssues.length === 0;
  const { canPublish, canArchive } = course.permissions;
  const live = course.liveVersion !== null && course.status !== 'ARCHIVED';
  const upToDate = course.status === 'PUBLISHED' && !course.hasUnpublishedChanges;
  const [confirming, setConfirming] = useState(false);

  let headline: string;
  if (course.status === 'ARCHIVED') headline = 'Archived. Learners can’t find this course.';
  else if (upToDate) headline = `Live as version ${course.liveVersion}. No unpublished changes.`;
  else if (course.status === 'REVIEW') headline = 'Waiting for an administrator to publish.';
  else if (live) headline = `Version ${course.liveVersion} is live. Your edits since then are not.`;
  else headline = 'Only you and administrators can see this draft.';

  const publish = async () => {
    setConfirming(false);
    const next = await mutate(
      'publish',
      `/admin/courses/${course.id}/publish`,
      { method: 'POST' },
      {
        success: 'Published. Learners now see this version.',
      },
    );
    if (next) onPublished();
  };

  return (
    <section
      aria-labelledby="publish-heading"
      className="rounded-lg border border-subtle bg-surface p-5"
    >
      <h2 id="publish-heading" className="text-h3 font-semibold">
        Publishing
      </h2>
      <p className="mt-1 text-support text-fg-muted">{headline}</p>

      <div className="mt-4">
        {upToDate ? null : ready ? (
          <p className="flex items-center gap-2 text-support font-medium text-success-text">
            <CheckCircle2 aria-hidden className="size-4" />
            Ready to publish
          </p>
        ) : (
          <>
            <p className="text-support font-medium">
              {plural(course.publishIssues.length, 'thing')} to fix before publishing
            </p>
            <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
              {course.publishIssues.map((issue, index) => (
                <li key={`${issue.path}-${index}`}>
                  <a
                    href={issueHref(course, issue)}
                    onClick={(event) => {
                      const href = issueHref(course, issue);
                      if (!href.startsWith('#')) {
                        event.preventDefault();
                        router.push(href);
                      }
                    }}
                    className="flex gap-2 rounded-md px-2 py-1.5 text-support text-fg hover:bg-hover"
                  >
                    <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-text" />
                    <span>{issue.message}</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-subtle pt-4">
        {canPublish ? (
          confirming ? (
            <div className="flex flex-col gap-2 rounded-md bg-primary-subtle p-3">
              <p className="text-support">
                {live
                  ? 'Replace the live version with these changes? Learners see them straight away.'
                  : 'Publish to the catalogue? Learners can find it straight away.'}
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={publish} loading={busy === 'publish'}>
                  Publish now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              block
              disabled={!ready || upToDate || busy !== null}
              onClick={() => setConfirming(true)}
            >
              {live
                ? 'Publish changes'
                : course.status === 'ARCHIVED'
                  ? 'Publish again'
                  : 'Publish'}
            </Button>
          )
        ) : null}
        {course.status === 'REVIEW' ? (
          <Button
            block
            variant="secondary"
            loading={busy === 'withdraw'}
            onClick={() =>
              void mutate(
                'withdraw',
                `/admin/courses/${course.id}/return-to-draft`,
                { method: 'POST' },
                {
                  success: 'Review request withdrawn.',
                },
              )
            }
          >
            {canPublish ? 'Return to editor' : 'Withdraw from review'}
          </Button>
        ) : !canPublish ? (
          <Button
            block
            disabled={!ready || upToDate || busy !== null}
            loading={busy === 'submit'}
            onClick={() =>
              void mutate(
                'submit',
                `/admin/courses/${course.id}/submit-for-review`,
                { method: 'POST' },
                {
                  success: 'Sent for review. An administrator will publish it.',
                },
              )
            }
          >
            Submit for review
          </Button>
        ) : null}
        {canArchive && live ? (
          <Button
            block
            variant="ghost"
            loading={busy === 'archive'}
            onClick={() =>
              void mutate(
                'archive',
                `/admin/courses/${course.id}/archive`,
                { method: 'POST' },
                {
                  success: 'Archived. The course is hidden from the catalogue.',
                },
              )
            }
          >
            Archive course
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function VersionsPanel({ versions }: { versions: Version[] }) {
  const format = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <section
      aria-labelledby="versions-heading"
      className="rounded-lg border border-subtle bg-surface p-5"
    >
      <h2 id="versions-heading" className="flex items-center gap-2 text-h3 font-semibold">
        <History aria-hidden className="size-4 text-fg-subtle" />
        Version history
      </h2>
      {versions.length ? (
        <ol className="mt-3 flex flex-col">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex items-start gap-3 border-b border-subtle py-2.5 last:border-b-0"
            >
              <span className="mt-0.5 text-support font-semibold tabular-nums">
                v{version.version}
              </span>
              <span className="min-w-0 flex-1 text-caption text-fg-muted">
                {format.format(new Date(version.publishedAt))}
                <br />
                by{' '}
                {version.publishedBy?.displayName ?? version.publishedBy?.email ?? 'a former user'}
              </span>
              {version.live ? (
                <span className="rounded-full bg-success-subtle px-2 py-0.5 text-caption font-medium text-success-text">
                  Live
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-support text-fg-muted">
          Nothing published yet. Each publish is kept here.
        </p>
      )}
    </section>
  );
}

// ---------- Page ----------

export function CourseEditor({
  initial,
  categories,
  owners,
  initialVersions,
}: {
  initial: AdminCourse;
  categories: { id: string; name: string; isActive: boolean }[];
  owners: { id: string; label: string }[] | null;
  initialVersions: Version[];
}) {
  const router = useRouter();
  const { course, busy, notice, mutate, setNotice } = useCourse(initial);
  const [versions, setVersions] = useState(initialVersions);

  async function refreshVersions() {
    try {
      const data = await apiFetch(`/admin/courses/${course.id}/versions`);
      setVersions(z.array(courseVersionSummarySchema).parse(data));
    } catch {
      // The list refreshes on the next page load.
    }
  }

  const neverPublished = course.liveVersion === null;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href="/studio"
          className="inline-flex w-fit items-center gap-1.5 rounded-sm text-support font-medium text-fg-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Course studio
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={course.status} />
              {course.hasUnpublishedChanges ? <ChangesBadge /> : null}
              <span className="text-caption text-fg-muted">
                {course.category.name} · Owner: {course.owner.displayName ?? course.owner.email}
              </span>
            </div>
            <h1 className="mt-2 text-[1.75rem] leading-9 font-semibold tracking-tight sm:text-[2rem] sm:leading-10">
              {course.title}
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <ButtonLink href={`/studio/courses/${course.id}/preview`} variant="secondary">
              <Eye aria-hidden className="size-4" />
              Preview
            </ButtonLink>
            {course.liveVersion && course.status !== 'ARCHIVED' ? (
              <ButtonLink href={`/courses/${course.slug}`} variant="ghost">
                View live
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </div>

      <NoticeBar notice={notice} />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DetailsForm
            key={course.id}
            course={course}
            categories={categories}
            owners={owners}
            mutate={mutate}
            busy={busy}
          />
          <Curriculum course={course} mutate={mutate} busy={busy} />
          {neverPublished ? (
            <section className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-body font-semibold text-danger-text">Delete this draft</h2>
                <p className="text-support text-fg-muted">
                  Removes the course and all its lessons. Published courses are archived instead.
                </p>
              </div>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  setNotice(null);
                  try {
                    await apiFetch(`/admin/courses/${course.id}`, { method: 'DELETE' });
                    router.push('/studio');
                    router.refresh();
                  } catch {
                    setNotice({
                      tone: 'danger',
                      message: 'The draft could not be deleted. Please try again.',
                    });
                  }
                }}
              >
                {confirmDelete ? 'Yes, delete it for good' : 'Delete draft'}
              </Button>
            </section>
          ) : null}
        </div>
        <aside
          className="flex flex-col gap-5 lg:sticky lg:top-8"
          aria-label="Publishing and history"
        >
          <PublishPanel course={course} mutate={mutate} busy={busy} onPublished={refreshVersions} />
          <VersionsPanel versions={versions} />
        </aside>
      </div>
    </div>
  );
}
