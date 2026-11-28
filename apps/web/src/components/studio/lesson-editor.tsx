'use client';

import {
  COMPLETION_RULES,
  CONTENT_BLOCK_TYPES,
  LESSON_CONTENT_SCHEMA_VERSION,
  LESSON_TYPES as LESSON_TYPE_VALUES,
  lessonContentSchema,
  parseInlineMarkdown,
  RESOURCE_TYPES,
  toInlineMarkdown,
  type AdminCourse,
  type CompletionRule,
  type ContentBlock,
  type ContentBlockType,
  type LessonType,
  type ResourceType,
} from '@luminai/contracts';
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { LessonContent } from '@/components/content/lesson-content';
import { Button } from '@/components/ui/button';
import { Checkbox, SelectField, TextField } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { LESSON_TYPES, RESOURCE_TYPE_LABELS } from '@/lib/course-format';
import { Card, ConfirmDelete, IconButton, NoticeBar, TextArea } from './course-editor';
import { linesToList, useCourse } from './use-course';

// ---------- Block drafts (what the form edits) ----------

interface DraftBlock {
  key: string;
  type: ContentBlockType;
  /** Heading text, reflection prompt, rich text (inline markdown), or list items one per line. */
  text: string;
  title: string;
  level: 2 | 3;
  tone: 'info' | 'tip' | 'warning';
  style: 'bullet' | 'numbered';
}

const BLOCK_LABELS: Record<ContentBlockType, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  list: 'List',
  callout: 'Callout',
  quote: 'Quote',
  example: 'Example',
  reflection: 'Reflection prompt',
  divider: 'Divider',
};

let keyCounter = 0;
const newKey = () => `b${(keyCounter += 1)}`;

function blank(type: ContentBlockType): DraftBlock {
  return { key: newKey(), type, text: '', title: '', level: 2, tone: 'tip', style: 'bullet' };
}

function toDraft(block: ContentBlock): DraftBlock {
  const draft = blank(block.type);
  switch (block.type) {
    case 'heading':
      return { ...draft, text: block.text, level: block.level };
    case 'paragraph':
      return { ...draft, text: toInlineMarkdown(block.content) };
    case 'list':
      return { ...draft, style: block.style, text: block.items.map(toInlineMarkdown).join('\n') };
    case 'callout':
      return {
        ...draft,
        tone: block.tone,
        title: block.title ?? '',
        text: toInlineMarkdown(block.content),
      };
    case 'quote':
      return { ...draft, title: block.attribution ?? '', text: toInlineMarkdown(block.content) };
    case 'example':
      return { ...draft, title: block.title ?? '', text: toInlineMarkdown(block.content) };
    case 'reflection':
      return { ...draft, text: block.prompt };
    case 'divider':
      return draft;
  }
}

function fromDraft(draft: DraftBlock): unknown {
  const rich = parseInlineMarkdown(draft.text.trim());
  const title = draft.title.trim() || undefined;
  switch (draft.type) {
    case 'heading':
      return { type: 'heading', level: draft.level, text: draft.text };
    case 'paragraph':
      return { type: 'paragraph', content: rich };
    case 'list':
      return {
        type: 'list',
        style: draft.style,
        items: linesToList(draft.text).map(parseInlineMarkdown),
      };
    case 'callout':
      return { type: 'callout', tone: draft.tone, content: rich, ...(title ? { title } : {}) };
    case 'quote':
      return { type: 'quote', content: rich, ...(title ? { attribution: title } : {}) };
    case 'example':
      return { type: 'example', content: rich, ...(title ? { title } : {}) };
    case 'reflection':
      return { type: 'reflection', prompt: draft.text };
    case 'divider':
      return { type: 'divider' };
  }
}

const COMPLETION_LABELS: Record<CompletionRule, string> = {
  MARK_COMPLETE: 'Learner marks it done',
  VIEW: 'Opening the lesson',
  MEDIA_FINISHED: 'Finishing the video or audio',
};

const FORMAT_HINT = 'Formatting: **bold**, *italic*, [link text](https://…)';

// ---------- Block editor ----------

function BlockFields({
  block,
  onChange,
  error,
}: {
  block: DraftBlock;
  onChange: (patch: Partial<DraftBlock>) => void;
  error: string | undefined;
}) {
  const text = (label: string, rows: number, hint?: string) => (
    <TextArea
      label={label}
      rows={rows}
      value={block.text}
      error={error}
      hint={hint}
      onChange={(event) => onChange({ text: event.target.value })}
    />
  );
  switch (block.type) {
    case 'heading':
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <TextField
            label="Heading text"
            size="md"
            value={block.text}
            error={error}
            maxLength={200}
            onChange={(event) => onChange({ text: event.target.value })}
          />
          <SelectField
            label="Size"
            value={String(block.level)}
            onChange={(event) => onChange({ level: event.target.value === '3' ? 3 : 2 })}
            options={[
              { value: '2', label: 'Section' },
              { value: '3', label: 'Subsection' },
            ]}
          />
        </div>
      );
    case 'paragraph':
      return text('Text', 4, FORMAT_HINT);
    case 'list':
      return (
        <div className="flex flex-col gap-3">
          <SelectField
            label="Style"
            value={block.style}
            onChange={(event) =>
              onChange({ style: event.target.value === 'numbered' ? 'numbered' : 'bullet' })
            }
            options={[
              { value: 'bullet', label: 'Bullets' },
              { value: 'numbered', label: 'Numbered steps' },
            ]}
          />
          {text('Items', 4, `One item per line. ${FORMAT_HINT}`)}
        </div>
      );
    case 'callout':
      return (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <SelectField
              label="Tone"
              value={block.tone}
              onChange={(event) => onChange({ tone: event.target.value as DraftBlock['tone'] })}
              options={[
                { value: 'tip', label: 'Tip' },
                { value: 'info', label: 'Note' },
                { value: 'warning', label: 'Watch out' },
              ]}
            />
            <TextField
              label="Title (optional)"
              size="md"
              value={block.title}
              maxLength={120}
              onChange={(event) => onChange({ title: event.target.value })}
            />
          </div>
          {text('Text', 3, FORMAT_HINT)}
        </div>
      );
    case 'quote':
      return (
        <div className="flex flex-col gap-3">
          {text('Quote', 3)}
          <TextField
            label="Who said it (optional)"
            size="md"
            value={block.title}
            maxLength={120}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </div>
      );
    case 'example':
      return (
        <div className="flex flex-col gap-3">
          <TextField
            label="Label (optional)"
            size="md"
            placeholder="Example"
            value={block.title}
            maxLength={120}
            onChange={(event) => onChange({ title: event.target.value })}
          />
          {text('Example', 3, FORMAT_HINT)}
        </div>
      );
    case 'reflection':
      return text('Question for the learner', 2, 'Learners can answer it with their AI mentor.');
    case 'divider':
      return (
        <p className="text-support text-fg-muted">
          A thin line that separates two parts of the lesson.
        </p>
      );
  }
}

function AddBlockMenu({ onAdd }: { onAdd: (type: ContentBlockType) => void }) {
  return (
    <div role="group" aria-label="Add a block" className="flex flex-wrap gap-2">
      {CONTENT_BLOCK_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onAdd(type)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-default bg-surface px-3 text-caption font-medium text-fg hover:border-primary hover:bg-primary-subtle hover:text-primary-strong"
        >
          <Plus aria-hidden className="size-3.5" />
          {BLOCK_LABELS[type]}
        </button>
      ))}
    </div>
  );
}

// ---------- Resources ----------

function Resources({
  course,
  lessonId,
  mutate,
  busy,
}: {
  course: AdminCourse;
  lessonId: string;
  mutate: ReturnType<typeof useCourse>['mutate'];
  busy: string | null;
}) {
  const lesson = course.modules
    .flatMap((module) => module.lessons)
    .find((item) => item.id === lessonId)!;
  const [type, setType] = useState<ResourceType>(
    lesson.type === 'VIDEO' ? 'VIDEO' : lesson.type === 'AUDIO' ? 'AUDIO' : 'LINK',
  );
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Not a <form>: this card sits inside the lesson form, and forms can't nest.
  async function addResource() {
    setErrors({});
    const next = await mutate(
      'add-resource',
      `/admin/lessons/${lessonId}/resources`,
      { method: 'POST', body: { type, title, externalUrl: url } },
      {
        success: 'Resource added.',
        onFieldErrors: (fieldErrors) =>
          setErrors(Object.fromEntries(fieldErrors.map((error) => [error.field, error.message]))),
      },
    );
    if (next) {
      setTitle('');
      setUrl('');
    }
  }

  return (
    <Card
      title="Media and resources"
      description="Video, audio, captions, transcripts and reading. Links must be https; file uploads arrive with media storage."
    >
      {lesson.resources.length ? (
        <ul className="mb-5 flex flex-col divide-y divide-subtle rounded-md border border-subtle">
          {lesson.resources.map((resource) => (
            <li key={resource.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="w-24 shrink-0 text-caption font-medium text-fg-muted">
                {RESOURCE_TYPE_LABELS[resource.type]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-support font-medium">{resource.title}</span>
                {resource.externalUrl ? (
                  <a
                    href={resource.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex max-w-full items-center gap-1 truncate text-caption text-primary hover:underline"
                  >
                    <span className="truncate">{resource.externalUrl}</span>
                    <ExternalLink aria-hidden className="size-3 shrink-0" />
                  </a>
                ) : null}
              </span>
              <ConfirmDelete
                label={`Remove ${resource.title}`}
                disabled={busy !== null}
                onConfirm={() =>
                  void mutate(
                    `delete:${resource.id}`,
                    `/admin/resources/${resource.id}`,
                    { method: 'DELETE' },
                    {
                      success: 'Resource removed.',
                    },
                  )
                }
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div
        role="group"
        aria-label="Add a resource"
        className="grid gap-3 sm:grid-cols-[150px_1fr]"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            if (title.trim() && url.trim()) void addResource();
          }
        }}
      >
        <SelectField
          label="Type"
          value={type}
          onChange={(event) => setType(event.target.value as ResourceType)}
          options={RESOURCE_TYPES.map((value) => ({ value, label: RESOURCE_TYPE_LABELS[value] }))}
        />
        <TextField
          label="Title"
          size="md"
          value={title}
          maxLength={120}
          error={errors.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextField
          label="Link"
          size="md"
          type="url"
          inputMode="url"
          placeholder="https://"
          className="sm:col-span-2"
          value={url}
          error={errors.externalUrl}
          onChange={(event) => setUrl(event.target.value)}
        />
        <div className="flex justify-end sm:col-span-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void addResource()}
            loading={busy === 'add-resource'}
            disabled={!title.trim() || !url.trim()}
          >
            <Plus aria-hidden className="size-4" />
            Add resource
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------- Page ----------

export function LessonEditor({ initial, lessonId }: { initial: AdminCourse; lessonId: string }) {
  const { course, busy, notice, mutate } = useCourse(initial);
  const lesson = course.modules
    .flatMap((module) => module.lessons)
    .find((item) => item.id === lessonId)!;
  const parentModule = course.modules.find((item) => item.id === lesson.moduleId)!;

  const fromLesson = () => ({
    title: lesson.title,
    type: lesson.type as LessonType,
    minutes: String(lesson.estimatedMinutes),
    completionRule: lesson.completionRule as CompletionRule,
    isRequired: lesson.isRequired,
    objectives: lesson.objectives.join('\n'),
    moduleId: lesson.moduleId,
  });
  const [settings, setSettings] = useState(fromLesson);
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => lesson.content.blocks.map(toDraft));
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({ s: fromLesson(), b: lesson.content.blocks.map(toDraft).map(fromDraft) }),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const parsed = useMemo(
    () =>
      lessonContentSchema.safeParse({
        schemaVersion: LESSON_CONTENT_SCHEMA_VERSION,
        blocks: blocks.map(fromDraft),
      }),
    [blocks],
  );
  const blockErrors = useMemo(() => {
    const map = new Map<number, string>();
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const index = issue.path[1];
        if (typeof index === 'number' && !map.has(index)) {
          map.set(
            index,
            issue.message.startsWith('Invalid') || issue.message.startsWith('Too small')
              ? "This can't be empty."
              : issue.message,
          );
        }
      }
    }
    return map;
  }, [parsed]);

  const dirty = JSON.stringify({ s: settings, b: blocks.map(fromDraft) }) !== savedSnapshot;
  const lessonIssues = course.publishIssues.filter((issue) => issue.path === `lesson:${lesson.id}`);
  const update = (index: number, patch: Partial<DraftBlock>) =>
    setBlocks((current) =>
      current.map((block, i) => (i === index ? { ...block, ...patch } : block)),
    );
  const move = (index: number, direction: -1 | 1) =>
    setBlocks((current) => {
      const next = [...current];
      const [block] = next.splice(index, 1);
      next.splice(index + direction, 0, block!);
      return next;
    });

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!parsed.success) return;
    setFieldErrors({});
    const minutes = Number(settings.minutes);
    const body = {
      title: settings.title,
      type: settings.type,
      estimatedMinutes: Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0,
      completionRule: settings.completionRule,
      isRequired: settings.isRequired,
      objectives: linesToList(settings.objectives),
      content: parsed.data,
      ...(settings.moduleId !== lesson.moduleId ? { moduleId: settings.moduleId } : {}),
    };
    const next = await mutate(
      'save',
      `/admin/lessons/${lesson.id}`,
      { method: 'PATCH', body },
      {
        success: 'Lesson saved.',
        onFieldErrors: (errors) =>
          setFieldErrors(
            Object.fromEntries(errors.map((error) => [error.field.split('.')[0], error.message])),
          ),
      },
    );
    if (next) {
      const saved = next.modules.flatMap((m) => m.lessons).find((item) => item.id === lesson.id)!;
      const s = {
        title: saved.title,
        type: saved.type,
        minutes: String(saved.estimatedMinutes),
        completionRule: saved.completionRule,
        isRequired: saved.isRequired,
        objectives: saved.objectives.join('\n'),
        moduleId: saved.moduleId,
      };
      const b = saved.content.blocks.map(toDraft);
      setSettings(s);
      setBlocks(b);
      setSavedSnapshot(JSON.stringify({ s, b: b.map(fromDraft) }));
    }
  }

  const type = LESSON_TYPES[settings.type];
  const isMedia = settings.type === 'VIDEO' || settings.type === 'AUDIO';

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-6 pb-24">
      <div className="flex flex-col gap-3">
        <Link
          href={`/studio/courses/${course.id}#curriculum`}
          className="inline-flex w-fit items-center gap-1.5 rounded-sm text-support font-medium text-fg-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {course.title}
        </Link>
        <p className="flex items-center gap-2 text-caption font-medium text-fg-muted">
          <type.icon aria-hidden className="size-4" />
          {type.label} lesson in “{parentModule.title}”
        </p>
        <h1 className="text-[1.75rem] leading-9 font-semibold tracking-tight">{lesson.title}</h1>
      </div>

      <NoticeBar notice={notice} />

      {lessonIssues.length ? (
        <div className="flex gap-3 rounded-md border border-warning/30 bg-warning-subtle px-4 py-3 text-support text-warning-text">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Before this course can be published</p>
            <ul className="mt-1 list-disc pl-5">
              {lessonIssues.map((issue) => (
                <li key={issue.message}>{issue.message.replace(`${lesson.title}: `, '')}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Lesson settings">
            <div className="flex flex-col gap-4">
              <TextField
                label="Title"
                size="md"
                value={settings.title}
                maxLength={120}
                error={fieldErrors.title}
                onChange={(event) => setSettings({ ...settings, title: event.target.value })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Lesson type"
                  value={settings.type}
                  onChange={(event) => {
                    const next = event.target.value as LessonType;
                    const media = next === 'VIDEO' || next === 'AUDIO';
                    setSettings({
                      ...settings,
                      type: next,
                      completionRule:
                        !media && settings.completionRule === 'MEDIA_FINISHED'
                          ? 'MARK_COMPLETE'
                          : settings.completionRule,
                    });
                  }}
                  options={LESSON_TYPE_VALUES.map((value) => ({
                    value,
                    label: LESSON_TYPES[value].label,
                  }))}
                />
                <TextField
                  label="Minutes"
                  size="md"
                  type="number"
                  min={0}
                  max={10000}
                  inputMode="numeric"
                  value={settings.minutes}
                  error={fieldErrors.estimatedMinutes}
                  onChange={(event) => setSettings({ ...settings, minutes: event.target.value })}
                />
                <SelectField
                  label="Counts as complete after"
                  value={settings.completionRule}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      completionRule: event.target.value as CompletionRule,
                    })
                  }
                  options={COMPLETION_RULES.filter(
                    (rule) => rule !== 'MEDIA_FINISHED' || isMedia,
                  ).map((rule) => ({
                    value: rule,
                    label: COMPLETION_LABELS[rule],
                  }))}
                />
                <SelectField
                  label="Module"
                  value={settings.moduleId}
                  onChange={(event) => setSettings({ ...settings, moduleId: event.target.value })}
                  options={course.modules.map((item, index) => ({
                    value: item.id,
                    label: `${index + 1}. ${item.title}`,
                  }))}
                  hint={
                    settings.moduleId !== lesson.moduleId
                      ? 'Saving moves the lesson to the end of that module.'
                      : undefined
                  }
                />
              </div>
              <Checkbox
                label="Required to complete the course"
                checked={settings.isRequired}
                onChange={(event) => setSettings({ ...settings, isRequired: event.target.checked })}
              />
              <TextArea
                label="Objectives"
                rows={3}
                value={settings.objectives}
                error={fieldErrors.objectives}
                onChange={(event) => setSettings({ ...settings, objectives: event.target.value })}
                hint="One per line: what the learner can do after this lesson."
              />
            </div>
          </Card>

          <Card
            title="Content"
            description={
              isMedia
                ? 'Notes shown under the media, such as key points or a summary.'
                : 'Build the lesson from blocks. Learners read them in this order.'
            }
          >
            <div className="flex flex-col gap-3">
              {blocks.length === 0 ? (
                <p className="rounded-md border border-dashed border-default p-5 text-center text-support text-fg-muted">
                  No content yet. Start with a paragraph or a heading.
                </p>
              ) : null}
              {blocks.map((block, index) => (
                <div
                  key={block.key}
                  className={cn(
                    'rounded-md border bg-surface-raised p-4',
                    blockErrors.has(index) ? 'border-danger/50' : 'border-subtle',
                  )}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex-1 text-overline font-semibold tracking-wider text-fg-subtle uppercase">
                      {index + 1}. {BLOCK_LABELS[block.type]}
                    </span>
                    <IconButton
                      label={`Move block ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`Move block ${index + 1} down`}
                      disabled={index === blocks.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden className="size-4" />
                    </IconButton>
                    <ConfirmDelete
                      label={`Delete block ${index + 1}`}
                      onConfirm={() =>
                        setBlocks((current) => current.filter((_, i) => i !== index))
                      }
                    />
                  </div>
                  <BlockFields
                    block={block}
                    error={blockErrors.get(index)}
                    onChange={(patch) => update(index, patch)}
                  />
                </div>
              ))}
              <div className="pt-2">
                <AddBlockMenu
                  onAdd={(blockType) => setBlocks((current) => [...current, blank(blockType)])}
                />
              </div>
            </div>
          </Card>

          <Resources course={course} lessonId={lesson.id} mutate={mutate} busy={busy} />
        </div>

        <aside aria-label="Preview" className="min-w-0 xl:sticky xl:top-8">
          <div className="rounded-lg border border-subtle bg-surface">
            <div className="flex items-center justify-between border-b border-subtle px-5 py-3">
              <h2 className="text-support font-semibold">Learner preview</h2>
              <span className="text-caption text-fg-muted">Updates as you type</span>
            </div>
            <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto px-5 py-6 sm:px-7">
              <h3 className="text-h2 font-semibold">{settings.title || 'Untitled lesson'}</h3>
              {linesToList(settings.objectives).length ? (
                <div className="mt-4 rounded-md bg-muted p-4">
                  <p className="text-overline font-semibold tracking-wider text-fg-subtle uppercase">
                    In this lesson you will
                  </p>
                  <ul className="mt-2 list-disc pl-5 text-support">
                    {linesToList(settings.objectives).map((objective) => (
                      <li key={objective}>{objective}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {parsed.success ? (
                <LessonContent content={parsed.data} className="mt-6" />
              ) : (
                <p className="mt-6 text-support text-fg-muted">
                  Fix the highlighted blocks to see the preview.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-subtle bg-surface/95 backdrop-blur transition-transform duration-200 lg:left-[264px]',
          dirty ? 'translate-y-0' : 'invisible translate-y-full',
        )}
        aria-hidden={!dirty}
      >
        <div className="mx-auto flex max-w-[1200px] items-center justify-end gap-3 px-4 py-3 sm:px-8 lg:px-10">
          <span className="mr-auto text-support text-fg-muted">
            {parsed.success
              ? 'You have unsaved changes.'
              : 'Some blocks need attention before saving.'}
          </span>
          <Button
            variant="ghost"
            tabIndex={dirty ? 0 : -1}
            onClick={() => {
              setSettings(fromLesson());
              setBlocks(lesson.content.blocks.map(toDraft));
            }}
          >
            Discard
          </Button>
          <Button
            type="submit"
            tabIndex={dirty ? 0 : -1}
            loading={busy === 'save'}
            disabled={!parsed.success}
          >
            Save lesson
          </Button>
        </div>
      </div>
    </form>
  );
}
