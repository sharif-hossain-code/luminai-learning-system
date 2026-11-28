'use client';

import { adminCourseSchema, type Category } from '@luminai/contracts';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/api-client';

/** Starts a draft with just a title and category; everything else is filled in the editor. */
export function NewCourseButton({ categories }: { categories: Pick<Category, 'id' | 'name'>[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [error, setError] = useState<string | undefined>();
  const [titleError, setTitleError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError('Give the course a working title.');
      return;
    }
    setSaving(true);
    setError(undefined);
    setTitleError(undefined);
    try {
      const course = adminCourseSchema.parse(
        await apiFetch('/admin/courses', { method: 'POST', body: { title, categoryId } }),
      );
      router.push(`/studio/courses/${course.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldMessage('title')) {
        setTitleError(caught.fieldMessage('title'));
      } else {
        setError(
          caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
        );
      }
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" />
        New course
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="New course"
      className="flex w-full flex-col gap-4 rounded-lg border border-subtle bg-surface p-5 shadow-soft sm:w-[420px]"
    >
      <h2 className="text-h3 font-semibold">Start a new course</h2>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TextField
        label="Working title"
        size="md"
        autoFocus
        value={title}
        maxLength={120}
        error={titleError}
        onChange={(event) => setTitle(event.target.value)}
        hint="You can change it until the course is published."
      />
      <SelectField
        label="Category"
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        options={categories.map((category) => ({ value: category.id, label: category.name }))}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Create draft
        </Button>
      </div>
    </form>
  );
}
