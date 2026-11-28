'use client';

import { slugify, type FieldError } from '@luminai/contracts';
import { ArrowLeft, Check, Pencil, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { categoryAccent, plural } from '@/lib/course-format';
import { Card, IconButton, NoticeBar, TextArea } from './course-editor';
import type { Notice } from './use-course';

export interface ManagedCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  courseCount: number;
}

const toMap = (errors: FieldError[]) =>
  Object.fromEntries(errors.map((error) => [error.field, error.message]));

/** Administrators add, rename and retire the categories courses are filed under. */
export function CategoryManager({ categories }: { categories: ManagedCategory[] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function send(
    key: string,
    path: string,
    method: 'POST' | 'PATCH',
    body: unknown,
    success: string,
  ): Promise<boolean> {
    setBusy(key);
    setNotice(null);
    setErrors({});
    try {
      await apiFetch(path, { method, body });
      setNotice({ tone: 'success', message: success });
      startRefresh(() => router.refresh());
      return true;
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(toMap(caught.fieldErrors));
        setNotice({ tone: 'danger', message: caught.message });
      } else {
        setNotice({ tone: 'danger', message: 'Something went wrong. Please try again.' });
      }
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/studio"
        className="inline-flex w-fit items-center gap-1.5 rounded-sm text-support font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Course studio
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight">Categories</h1>
          <p className="mt-1 text-fg-muted">
            Learners filter the catalogue by these. A hidden category keeps its courses but can’t be
            chosen for new ones.
          </p>
        </div>
        {adding ? null : (
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" />
            New category
          </Button>
        )}
      </div>

      <NoticeBar notice={notice} />

      {adding ? (
        <AddForm
          busy={busy === 'create'}
          errors={errors}
          onCancel={() => {
            setAdding(false);
            setErrors({});
          }}
          onSubmit={async (values) => {
            if (
              await send('create', '/admin/categories', 'POST', values, `Added ${values.name}.`)
            ) {
              setAdding(false);
            }
          }}
        />
      ) : null}

      <Card
        title="All categories"
        description={plural(categories.length, 'category', 'categories')}
      >
        <ul className={cn('-my-5 -mx-5 sm:-mx-6', refreshing && 'opacity-60')}>
          {categories.map((category) =>
            editing === category.id ? (
              <EditRow
                key={category.id}
                category={category}
                busy={busy === category.id}
                errors={errors}
                onCancel={() => {
                  setEditing(null);
                  setErrors({});
                }}
                onSubmit={async (values) => {
                  if (
                    await send(
                      category.id,
                      `/admin/categories/${category.id}`,
                      'PATCH',
                      values,
                      `Saved ${values.name}.`,
                    )
                  ) {
                    setEditing(null);
                  }
                }}
              />
            ) : (
              <li
                key={category.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-subtle px-5 py-4 last:border-b-0 sm:px-6"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-3 shrink-0 rounded-full bg-current',
                    categoryAccent(category.slug).text,
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-body font-semibold">
                    {category.name}
                    {category.isActive ? null : (
                      <span className="rounded-full bg-subtle px-2 py-0.5 text-caption font-medium text-fg-muted">
                        Hidden
                      </span>
                    )}
                  </p>
                  <p className="text-caption text-fg-muted">
                    /{category.slug} · {plural(category.courseCount, 'course')}
                    {category.description ? ` · ${category.description}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      void send(
                        category.id,
                        `/admin/categories/${category.id}`,
                        'PATCH',
                        { isActive: !category.isActive },
                        category.isActive
                          ? `${category.name} is hidden from new courses.`
                          : `${category.name} is available again.`,
                      )
                    }
                  >
                    {category.isActive ? 'Hide' : 'Show'}
                  </Button>
                  <IconButton
                    label={`Edit ${category.name}`}
                    disabled={busy !== null}
                    onClick={() => {
                      setEditing(category.id);
                      setErrors({});
                    }}
                  >
                    <Pencil aria-hidden className="size-4" />
                  </IconButton>
                </div>
              </li>
            ),
          )}
        </ul>
      </Card>
    </div>
  );
}

interface Values {
  name: string;
  description: string | null;
}

function AddForm({
  busy,
  errors,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  errors: Record<string, string>;
  onCancel: () => void;
  onSubmit: (values: Values & { slug: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('Give the category a name.');
      return;
    }
    setNameError(undefined);
    void onSubmit({
      name,
      slug: slug || slugify(name),
      description: description.trim() || null,
    });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="New category"
      className="grid gap-4 rounded-lg border border-subtle bg-surface p-5 shadow-soft sm:grid-cols-2 sm:p-6"
    >
      <TextField
        label="Name"
        size="md"
        value={name}
        autoFocus
        maxLength={80}
        error={nameError ?? errors.name}
        onChange={(event) => {
          setName(event.target.value);
          if (!slugTouched) setSlug(slugify(event.target.value));
        }}
      />
      <TextField
        label="Web address"
        size="md"
        value={slug}
        maxLength={80}
        hint="Lowercase letters, numbers and hyphens. Can’t be changed later."
        error={errors.slug}
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(event.target.value);
        }}
      />
      <TextArea
        label="Description (optional)"
        className="sm:col-span-2"
        rows={2}
        maxLength={300}
        value={description}
        error={errors.description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" loading={busy}>
          Add category
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EditRow({
  category,
  busy,
  errors,
  onCancel,
  onSubmit,
}: {
  category: ManagedCategory;
  busy: boolean;
  errors: Record<string, string>;
  onCancel: () => void;
  onSubmit: (values: Values) => Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? '');

  return (
    <li className="border-b border-subtle bg-surface-raised px-5 py-4 last:border-b-0 sm:px-6">
      <form
        noValidate
        aria-label={`Edit ${category.name}`}
        className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit({ name, description: description.trim() || null });
        }}
      >
        <TextField
          label="Name"
          size="md"
          value={name}
          autoFocus
          maxLength={80}
          error={errors.name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Description"
          size="md"
          value={description}
          maxLength={300}
          error={errors.description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="flex gap-1 pb-1">
          <IconButton label="Save" type="submit" disabled={busy} className="text-primary">
            <Check aria-hidden className="size-4" />
          </IconButton>
          <IconButton label="Cancel" onClick={onCancel}>
            <X aria-hidden className="size-4" />
          </IconButton>
        </div>
      </form>
    </li>
  );
}
