'use client';

import {
  FEEDBACK_MODES,
  isScoredType,
  QUESTION_LIMITS,
  QUESTION_TYPES,
  type AdminAssessment,
  type AdminCourse,
  type AdminQuestion,
  type FeedbackMode,
  type QuestionType,
} from '@luminai/contracts';
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, SelectField, TextField } from '@/components/ui/field';
import { FEEDBACK_MODE_LABELS, plural, QUESTION_TYPE_LABELS } from '@/lib/assessment-format';
import { cn } from '@/lib/cn';
import { Card, ConfirmDelete, IconButton, NoticeBar, TextArea } from './course-editor';
import { linesToList, useCourse } from './use-course';

type Mutate = ReturnType<typeof useCourse>['mutate'];

/** Option and criterion ids: short, lower-case and unique within the question. */
const newId = () => crypto.randomUUID().slice(0, 12);

const toInt = (value: string, fallback: number) => {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) ? Math.round(number) : fallback;
};

const fieldErrorMap = (errors: { field: string; message: string }[]) =>
  Object.fromEntries(errors.map((error) => [error.field.split('.')[0], error.message]));

// ---------- Settings ----------

function settingsOf(assessment: AdminAssessment) {
  return {
    title: assessment.title,
    instructions: assessment.instructions,
    moduleId: assessment.moduleId ?? '',
    minutes: String(assessment.estimatedMinutes),
    passPercent: String(assessment.passPercent),
    maxAttempts: assessment.maxAttempts === null ? '' : String(assessment.maxAttempts),
    feedbackMode: assessment.feedbackMode,
    isRequired: assessment.isRequired,
  };
}

function SettingsCard({
  course,
  assessment,
  mutate,
  busy,
}: {
  course: AdminCourse;
  assessment: AdminAssessment;
  mutate: Mutate;
  busy: string | null;
}) {
  const [settings, setSettings] = useState(() => settingsOf(assessment));
  const [saved, setSaved] = useState(() => JSON.stringify(settingsOf(assessment)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(settings) !== saved;

  async function save(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    const next = await mutate(
      'settings',
      `/admin/assessments/${assessment.id}`,
      {
        method: 'PATCH',
        body: {
          title: settings.title,
          instructions: settings.instructions,
          moduleId: settings.moduleId || null,
          estimatedMinutes: Math.max(0, toInt(settings.minutes, 0)),
          passPercent: toInt(settings.passPercent, assessment.passPercent),
          maxAttempts: settings.maxAttempts ? Number(settings.maxAttempts) : null,
          feedbackMode: settings.feedbackMode,
          isRequired: settings.isRequired,
        },
      },
      { success: 'Quiz settings saved.', onFieldErrors: (list) => setErrors(fieldErrorMap(list)) },
    );
    const updated = next?.assessments.find((item) => item.id === assessment.id);
    if (updated) {
      setSettings(settingsOf(updated));
      setSaved(JSON.stringify(settingsOf(updated)));
    }
  }

  return (
    <Card title="Quiz settings">
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        <TextField
          label="Title"
          size="md"
          value={settings.title}
          maxLength={120}
          error={errors.title}
          onChange={(event) => setSettings({ ...settings, title: event.target.value })}
        />
        <TextArea
          label="Instructions"
          rows={3}
          value={settings.instructions}
          error={errors.instructions}
          hint="Shown on the quiz start page."
          onChange={(event) => setSettings({ ...settings, instructions: event.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Placed in"
            value={settings.moduleId}
            onChange={(event) => setSettings({ ...settings, moduleId: event.target.value })}
            options={[
              ...course.modules.map((item, index) => ({
                value: item.id,
                label: `${index + 1}. ${item.title}`,
              })),
              { value: '', label: 'Final assessment (after the last module)' },
            ]}
          />
          <TextField
            label="Minutes"
            size="md"
            type="number"
            min={0}
            max={1000}
            inputMode="numeric"
            value={settings.minutes}
            error={errors.estimatedMinutes}
            onChange={(event) => setSettings({ ...settings, minutes: event.target.value })}
          />
          <TextField
            label="Pass mark (%)"
            size="md"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={settings.passPercent}
            error={errors.passPercent}
            onChange={(event) => setSettings({ ...settings, passPercent: event.target.value })}
          />
          <SelectField
            label="Attempts"
            value={settings.maxAttempts}
            error={errors.maxAttempts}
            onChange={(event) => setSettings({ ...settings, maxAttempts: event.target.value })}
            options={[
              { value: '', label: 'Unlimited' },
              ...[1, 2, 3, 4, 5, 10].map((count) => ({
                value: String(count),
                label: plural(count, 'attempt'),
              })),
            ]}
          />
          <SelectField
            label="After submitting, learners see"
            className="sm:col-span-2"
            value={settings.feedbackMode}
            onChange={(event) =>
              setSettings({ ...settings, feedbackMode: event.target.value as FeedbackMode })
            }
            hint={
              settings.feedbackMode === 'FULL'
                ? 'Correct answers appear once the learner passes or uses every attempt.'
                : undefined
            }
            options={FEEDBACK_MODES.map((mode) => ({
              value: mode,
              label: FEEDBACK_MODE_LABELS[mode],
            }))}
          />
        </div>
        <Checkbox
          label="Required to complete the course"
          checked={settings.isRequired}
          onChange={(event) => setSettings({ ...settings, isRequired: event.target.checked })}
        />
        <div className="flex justify-end gap-2">
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={() => setSettings(JSON.parse(saved))}>
              Discard
            </Button>
          ) : null}
          <Button type="submit" size="sm" loading={busy === 'settings'} disabled={!dirty}>
            Save settings
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------- One question ----------

type DraftOption = { id: string; text: string; correct: boolean };
type DraftCriterion = { id: string; label: string; description: string };
type Draft = {
  type: QuestionType;
  prompt: string;
  points: string;
  options: DraftOption[];
  trueFalse: 'true' | 'false' | null;
  accepted: string;
  explanation: string;
  criteria: DraftCriterion[];
  minWords: string;
  maxWords: string;
};

const blankOptions = (): DraftOption[] => [
  { id: newId(), text: '', correct: false },
  { id: newId(), text: '', correct: false },
];

function draftOf(question: AdminQuestion): Draft {
  const correct = new Set(question.answerKey.correctOptionIds ?? []);
  const choice = question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE';
  const tf = question.answerKey.correctOptionIds?.[0];
  return {
    type: question.type,
    prompt: question.prompt,
    points: String(question.points || 1),
    options:
      choice && question.options.length
        ? question.options.map((option) => ({ ...option, correct: correct.has(option.id) }))
        : blankOptions(),
    trueFalse: question.type === 'TRUE_FALSE' && (tf === 'true' || tf === 'false') ? tf : null,
    accepted: (question.answerKey.acceptedAnswers ?? []).join('\n'),
    explanation: question.explanation,
    criteria: question.rubric.criteria.map((criterion) => ({ ...criterion })),
    minWords: question.rubric.minWords === null ? '' : String(question.rubric.minWords),
    maxWords: question.rubric.maxWords === null ? '' : String(question.rubric.maxWords),
  };
}

function bodyOf(draft: Draft) {
  const base = {
    type: draft.type,
    prompt: draft.prompt,
    explanation: draft.explanation,
    points: Math.max(0, toInt(draft.points, 1)),
  };
  if (draft.type === 'SINGLE_CHOICE' || draft.type === 'MULTIPLE_CHOICE') {
    const options = draft.options.filter((option) => option.text.trim());
    return {
      ...base,
      options: options.map(({ id, text }) => ({ id, text: text.trim() })),
      answerKey: {
        correctOptionIds: options.filter((option) => option.correct).map((option) => option.id),
      },
    };
  }
  if (draft.type === 'TRUE_FALSE') {
    return { ...base, answerKey: { correctOptionIds: draft.trueFalse ? [draft.trueFalse] : [] } };
  }
  if (draft.type === 'SHORT_TEXT') {
    return { ...base, answerKey: { acceptedAnswers: linesToList(draft.accepted) } };
  }
  const words = (value: string) => (value.trim() ? Math.max(1, toInt(value, 1)) : null);
  return {
    ...base,
    rubric: {
      criteria: draft.criteria
        .filter((criterion) => criterion.label.trim())
        .map((criterion) => ({ ...criterion, label: criterion.label.trim() })),
      minWords: words(draft.minWords),
      maxWords: words(draft.maxWords),
    },
  };
}

function QuestionForm({
  question,
  number,
  mutate,
  busy,
  onClose,
}: {
  question: AdminQuestion;
  number: number;
  mutate: Mutate;
  busy: string | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(question));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const groupId = useId();
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const choice = draft.type === 'SINGLE_CHOICE' || draft.type === 'MULTIPLE_CHOICE';

  async function save(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    const next = await mutate(
      `question:${question.id}`,
      `/admin/questions/${question.id}`,
      { method: 'PATCH', body: bodyOf(draft) },
      { success: 'Question saved.', onFieldErrors: (list) => setErrors(fieldErrorMap(list)) },
    );
    if (next) onClose();
  }

  const setOption = (index: number, patch: Partial<DraftOption>) =>
    set({
      options: draft.options.map((option, i) => {
        if (i === index) return { ...option, ...patch };
        // Single choice: marking one option correct clears the others.
        if (patch.correct && draft.type === 'SINGLE_CHOICE') return { ...option, correct: false };
        return option;
      }),
    });

  return (
    <form
      aria-label={`Edit question ${number}`}
      onSubmit={save}
      noValidate
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className="flex flex-col gap-4 rounded-md border border-primary/30 bg-primary-subtle/30 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
        <SelectField
          label="Question type"
          value={draft.type}
          onChange={(event) => {
            const type = event.target.value as QuestionType;
            const keepOptions = draft.options.some((option) => option.text.trim());
            set({
              type,
              options:
                type === 'SINGLE_CHOICE' && draft.type === 'MULTIPLE_CHOICE'
                  ? draft.options.map((option, i, all) => ({
                      ...option,
                      correct: option.correct && all.findIndex((o) => o.correct) === i,
                    }))
                  : keepOptions
                    ? draft.options
                    : blankOptions(),
            });
          }}
          options={QUESTION_TYPES.map((type) => ({
            value: type,
            label: QUESTION_TYPE_LABELS[type],
          }))}
        />
        {isScoredType(draft.type) ? (
          <TextField
            label="Points"
            size="md"
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            value={draft.points}
            error={errors.points}
            onChange={(event) => set({ points: event.target.value })}
          />
        ) : null}
      </div>
      <TextArea
        label="Question"
        rows={2}
        value={draft.prompt}
        error={errors.prompt}
        onChange={(event) => set({ prompt: event.target.value })}
      />

      {choice ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-support font-medium">
            Options{' '}
            <span className="font-normal text-fg-muted">
              ·{' '}
              {draft.type === 'SINGLE_CHOICE'
                ? 'mark the correct answer'
                : 'tick every correct answer'}
            </span>
          </legend>
          {draft.options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2.5">
              <input
                type={draft.type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                name={`${groupId}-correct`}
                aria-label={`Option ${index + 1} is correct`}
                checked={option.correct}
                onChange={(event) => setOption(index, { correct: event.target.checked })}
                className="size-[18px] shrink-0 cursor-pointer accent-[var(--brand-success)]"
              />
              <input
                aria-label={`Option ${index + 1}`}
                value={option.text}
                maxLength={300}
                placeholder={`Option ${index + 1}`}
                onChange={(event) => setOption(index, { text: event.target.value })}
                className="field-control h-10 min-w-0 flex-1"
              />
              <IconButton
                label={`Remove option ${index + 1}`}
                disabled={draft.options.length <= 2}
                onClick={() => set({ options: draft.options.filter((_, i) => i !== index) })}
              >
                <X aria-hidden className="size-4" />
              </IconButton>
            </div>
          ))}
          {errors.options || errors.answerKey ? (
            <p className="text-caption text-danger-text">{errors.options ?? errors.answerKey}</p>
          ) : null}
          {draft.options.length < QUESTION_LIMITS.optionsPerQuestion ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() =>
                set({ options: [...draft.options, { id: newId(), text: '', correct: false }] })
              }
            >
              <Plus aria-hidden className="size-4" />
              Add option
            </Button>
          ) : null}
        </fieldset>
      ) : null}

      {draft.type === 'TRUE_FALSE' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-support font-medium">The correct answer</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(['true', 'false'] as const).map((value) => (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-md border px-4 py-3 text-support',
                  draft.trueFalse === value
                    ? 'border-primary bg-primary-subtle/50 font-semibold'
                    : 'border-input bg-surface',
                )}
              >
                <input
                  type="radio"
                  name={`${groupId}-tf`}
                  checked={draft.trueFalse === value}
                  onChange={() => set({ trueFalse: value })}
                  className="size-[18px] accent-[var(--brand-primary)]"
                />
                {value === 'true' ? 'True' : 'False'} is correct
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {draft.type === 'SHORT_TEXT' ? (
        <TextArea
          label="Accepted answers"
          rows={3}
          value={draft.accepted}
          error={errors.answerKey}
          onChange={(event) => set({ accepted: event.target.value })}
          hint="One per line. Matching ignores capitals, extra spaces and end punctuation."
        />
      ) : null}

      {draft.type === 'WRITING' ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-md bg-secondary-subtle/60 px-3.5 py-2.5 text-caption text-secondary-strong">
            Writing answers aren&apos;t scored. Learners get AI feedback against these criteria
            only, clearly marked as AI.
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-support font-medium">Rubric criteria</legend>
            {draft.criteria.map((criterion, index) => (
              <div key={criterion.id} className="flex items-start gap-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <input
                    aria-label={`Criterion ${index + 1}`}
                    value={criterion.label}
                    maxLength={120}
                    placeholder="e.g. States the news plainly"
                    onChange={(event) =>
                      set({
                        criteria: draft.criteria.map((item, i) =>
                          i === index ? { ...item, label: event.target.value } : item,
                        ),
                      })
                    }
                    className="field-control h-10"
                  />
                  <input
                    aria-label={`Criterion ${index + 1}: what good looks like`}
                    value={criterion.description}
                    maxLength={500}
                    placeholder="What good looks like (optional)"
                    onChange={(event) =>
                      set({
                        criteria: draft.criteria.map((item, i) =>
                          i === index ? { ...item, description: event.target.value } : item,
                        ),
                      })
                    }
                    className="field-control h-10 text-support"
                  />
                </div>
                <IconButton
                  label={`Remove criterion ${index + 1}`}
                  onClick={() => set({ criteria: draft.criteria.filter((_, i) => i !== index) })}
                >
                  <X aria-hidden className="size-4" />
                </IconButton>
              </div>
            ))}
            {errors.rubric ? (
              <p className="text-caption text-danger-text">{errors.rubric}</p>
            ) : null}
            {draft.criteria.length < QUESTION_LIMITS.rubricCriteria ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() =>
                  set({
                    criteria: [...draft.criteria, { id: newId(), label: '', description: '' }],
                  })
                }
              >
                <Plus aria-hidden className="size-4" />
                Add criterion
              </Button>
            ) : null}
          </fieldset>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Min words"
              size="md"
              type="number"
              min={1}
              max={2000}
              inputMode="numeric"
              value={draft.minWords}
              onChange={(event) => set({ minWords: event.target.value })}
            />
            <TextField
              label="Max words"
              size="md"
              type="number"
              min={1}
              max={2000}
              inputMode="numeric"
              value={draft.maxWords}
              onChange={(event) => set({ maxWords: event.target.value })}
            />
          </div>
        </div>
      ) : null}

      <TextArea
        label="Explanation"
        rows={2}
        value={draft.explanation}
        error={errors.explanation}
        hint="Shown after submitting, if the quiz settings allow."
        onChange={(event) => set({ explanation: event.target.value })}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={busy === `question:${question.id}`}>
          Save question
        </Button>
      </div>
    </form>
  );
}

// ---------- Questions ----------

function QuestionsCard({
  assessment,
  issues,
  mutate,
  busy,
}: {
  assessment: AdminAssessment;
  issues: string[];
  mutate: Mutate;
  busy: string | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [newType, setNewType] = useState<QuestionType>('SINGLE_CHOICE');
  const { questions } = assessment;
  const points = questions.reduce((sum, question) => sum + question.points, 0);

  function move(index: number, direction: -1 | 1) {
    const ids = questions.map((question) => question.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + direction, 0, id!);
    void mutate(`move:${id}`, `/admin/assessments/${assessment.id}/question-order`, {
      method: 'PUT',
      body: { ids },
    });
  }

  async function add() {
    const before = new Set(questions.map((question) => question.id));
    const next = await mutate('add-question', `/admin/assessments/${assessment.id}/questions`, {
      method: 'POST',
      body: { type: newType },
    });
    const created = next?.assessments
      .find((item) => item.id === assessment.id)
      ?.questions.find((question) => !before.has(question.id));
    if (created) setEditing(created.id);
  }

  return (
    <Card
      id="questions"
      title="Questions"
      description={`${plural(questions.length, 'question')} · ${plural(points, 'point')}`}
    >
      {questions.length === 0 ? (
        <p className="rounded-md border border-dashed border-default p-5 text-center text-support text-fg-muted">
          No questions yet. Add one below.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {questions.map((question, index) => {
            const problems = issues.filter((issue) => issue.startsWith(`Question ${index + 1}:`));
            return (
              <li key={question.id}>
                {editing === question.id ? (
                  <QuestionForm
                    question={question}
                    number={index + 1}
                    mutate={mutate}
                    busy={busy}
                    onClose={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-subtle px-3 py-2">
                    <span className="w-5 shrink-0 text-center text-support font-semibold text-fg-subtle">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing(question.id)}
                      className="min-w-0 flex-1 truncate rounded-sm py-1.5 text-left hover:text-primary hover:underline hover:underline-offset-4"
                    >
                      {question.prompt || <em className="text-fg-muted">Untitled question</em>}
                    </button>
                    {problems.length ? (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-subtle px-2 py-0.5 text-caption font-medium text-warning-text"
                        title={problems.join('\n')}
                      >
                        <AlertCircle aria-hidden className="size-3.5" />
                        {plural(problems.length, 'issue')}
                      </span>
                    ) : null}
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-caption text-fg-muted">
                      {QUESTION_TYPE_LABELS[question.type]}
                      {isScoredType(question.type) ? ` · ${question.points} pt` : ' · not scored'}
                    </span>
                    <span className="flex shrink-0 items-center">
                      <IconButton
                        label={`Move question ${index + 1} up`}
                        disabled={index === 0 || busy !== null}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`Move question ${index + 1} down`}
                        disabled={index === questions.length - 1 || busy !== null}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`Edit question ${index + 1}`}
                        onClick={() => setEditing(question.id)}
                      >
                        <Pencil aria-hidden className="size-4" />
                      </IconButton>
                      <ConfirmDelete
                        label={`Delete question ${index + 1}`}
                        disabled={busy !== null}
                        onConfirm={() =>
                          void mutate(
                            `delete:${question.id}`,
                            `/admin/questions/${question.id}`,
                            { method: 'DELETE' },
                            { success: 'Question deleted.' },
                          )
                        }
                      />
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {questions.length < QUESTION_LIMITS.questionsPerAssessment ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            aria-label="New question type"
            value={newType}
            onChange={(event) => setNewType(event.target.value as QuestionType)}
            className="field-control h-9 w-48 text-support"
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" loading={busy === 'add-question'} onClick={add}>
            <Plus aria-hidden className="size-4" />
            Add question
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- Page ----------

/** The quiz editor (Assessment.dc.html, 6): settings, then questions. */
export function AssessmentEditor({
  initial,
  assessmentId,
}: {
  initial: AdminCourse;
  assessmentId: string;
}) {
  const router = useRouter();
  const { course, busy, notice, mutate } = useCourse(initial);
  const assessment = course.assessments.find((item) => item.id === assessmentId);
  if (!assessment) {
    return (
      <p className="text-fg-muted">
        This quiz was deleted.{' '}
        <Link href={`/studio/courses/${course.id}#curriculum`} className="text-primary">
          Back to the course
        </Link>
      </p>
    );
  }
  const parent = course.modules.find((item) => item.id === assessment.moduleId);
  const issues = course.publishIssues
    .filter((issue) => issue.path === `assessment:${assessment.id}`)
    .map((issue) => issue.message.replace(`${assessment.title}: `, ''));

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-3">
          <Link
            href={`/studio/courses/${course.id}#curriculum`}
            className="inline-flex w-fit items-center gap-1.5 rounded-sm text-support font-medium text-fg-muted hover:text-fg"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {course.title}
          </Link>
          <p className="text-caption font-medium text-fg-muted">
            {parent ? `Quiz in “${parent.title}”` : 'Final assessment'}
          </p>
          <h1 className="text-[1.75rem] leading-9 font-semibold tracking-tight">
            {assessment.title}
          </h1>
        </div>
        <ConfirmDelete
          label={`Delete ${assessment.title}`}
          disabled={busy !== null}
          onConfirm={async () => {
            const next = await mutate('delete-quiz', `/admin/assessments/${assessment.id}`, {
              method: 'DELETE',
            });
            if (next) router.push(`/studio/courses/${course.id}#curriculum`);
          }}
        />
      </div>

      <NoticeBar notice={notice} />

      {issues.length ? (
        <div className="flex gap-3 rounded-md border border-warning/30 bg-warning-subtle px-4 py-3 text-support text-warning-text">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Before this course can be published</p>
            <ul className="mt-1 list-disc pl-5">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="flex max-w-[880px] flex-col gap-6">
        <SettingsCard course={course} assessment={assessment} mutate={mutate} busy={busy} />
        <QuestionsCard assessment={assessment} issues={issues} mutate={mutate} busy={busy} />
      </div>
    </div>
  );
}
