import { z } from 'zod';

/**
 * Lesson content format, version 1.
 *
 * Lessons are stored as structured blocks, never as HTML. Text is plain text
 * with a small set of inline marks (bold, italic, links), so the web app renders
 * it with React elements and nothing a content editor types can become markup.
 * Documented in docs/architecture/course-content.md. A breaking change to this
 * shape needs a new `schemaVersion` and a migration of stored lessons.
 */
export const LESSON_CONTENT_SCHEMA_VERSION = 1;

// ---------- Text hygiene ----------

/**
 * C0/C1 control characters (except tab and newline) and Unicode bidi overrides,
 * which can disguise text ("Trojan Source"-style spoofing). Removed from every
 * piece of authored text.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

/** Normalises authored text: NFC, \n line endings, no control or bidi-override characters. */
export function cleanText(value: string): string {
  return value.normalize('NFC').replace(/\r\n?/g, '\n').replace(UNSAFE_CHARACTERS, '');
}

/** A trimmed, cleaned single-line string. */
export function plainText(max: number, label = 'This field') {
  return z
    .string()
    .transform((value) => cleanText(value).replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(1, `${label} can't be empty.`)
        .max(max, `${label} must be at most ${max} characters.`),
    );
}

/** A trimmed, cleaned string that may span several lines (paragraph breaks kept). */
export function multilineText(max: number, label = 'This field') {
  return z
    .string()
    .transform((value) =>
      cleanText(value)
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    )
    .pipe(z.string().max(max, `${label} must be at most ${max} characters.`));
}

// ---------- Safe URL policy ----------

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[.*\])$/i;

/**
 * External links must be https, carry no credentials and point at a public
 * host name (no localhost, private IPs or IP literals). Returns a reason when
 * the URL is refused, or null when it is acceptable.
 */
export function unsafeUrlReason(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Enter a full link, starting with https://';
  }
  if (url.protocol !== 'https:') return 'Links must start with https://';
  if (url.username || url.password) return 'Links cannot contain a user name or password.';
  if (PRIVATE_HOST.test(url.hostname) || /^\d+(\.\d+){3}$/.test(url.hostname)) {
    return 'Links must point to a public website.';
  }
  if (!url.hostname.includes('.')) return 'Links must point to a public website.';
  return null;
}

export const safeUrlSchema = z
  .string()
  .trim()
  .max(2048, 'Links must be at most 2048 characters.')
  .superRefine((value, context) => {
    const reason = unsafeUrlReason(value);
    if (reason) context.addIssue({ code: 'custom', message: reason });
  })
  .transform((value) => new URL(value).toString());

// ---------- Rich text (inline spans) ----------

export const inlineSpanSchema = z
  .object({
    text: z.string().transform(cleanText).pipe(z.string().min(1).max(5000)),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    href: safeUrlSchema.optional(),
  })
  .strict();
export type InlineSpan = z.infer<typeof inlineSpanSchema>;

export const richTextSchema = z.array(inlineSpanSchema).min(1, "Text can't be empty.").max(200);
export type RichText = z.infer<typeof richTextSchema>;

// ---------- Blocks ----------

export const CONTENT_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'list',
  'callout',
  'quote',
  'example',
  'reflection',
  'divider',
] as const;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

export const contentBlockSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('heading'),
      level: z.union([z.literal(2), z.literal(3)]),
      text: plainText(200, 'A heading'),
    })
    .strict(),
  z.object({ type: z.literal('paragraph'), content: richTextSchema }).strict(),
  z
    .object({
      type: z.literal('list'),
      style: z.enum(['bullet', 'numbered']),
      items: z.array(richTextSchema).min(1, 'Add at least one list item.').max(50),
    })
    .strict(),
  z
    .object({
      type: z.literal('callout'),
      tone: z.enum(['info', 'tip', 'warning']),
      title: plainText(120, 'A callout title').optional(),
      content: richTextSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('quote'),
      content: richTextSchema,
      attribution: plainText(120, 'An attribution').optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('example'),
      title: plainText(120, 'An example title').optional(),
      content: richTextSchema,
    })
    .strict(),
  z
    .object({ type: z.literal('reflection'), prompt: plainText(1000, 'A reflection prompt') })
    .strict(),
  z.object({ type: z.literal('divider') }).strict(),
]);
export type ContentBlock = z.infer<typeof contentBlockSchema>;

export const lessonContentSchema = z
  .object({
    schemaVersion: z.literal(LESSON_CONTENT_SCHEMA_VERSION),
    blocks: z.array(contentBlockSchema).max(200, 'A lesson can have at most 200 blocks.'),
  })
  .strict();
export type LessonContent = z.infer<typeof lessonContentSchema>;

export const EMPTY_LESSON_CONTENT: LessonContent = {
  schemaVersion: LESSON_CONTENT_SCHEMA_VERSION,
  blocks: [],
};

// ---------- Inline markdown (authoring format) ----------

/**
 * Editors type a tiny markdown subset: **bold**, *italic* and [text](https://…).
 * It is parsed into spans before saving, so the stored format stays structured.
 * Anything else, including HTML, is kept as literal text. A link whose URL fails
 * the safe URL policy is kept as its plain label.
 */
export function parseInlineMarkdown(source: string): InlineSpan[] {
  const text = cleanText(source);
  const spans: InlineSpan[] = [];
  const push = (span: InlineSpan) => {
    if (!span.text) return;
    const last = spans.at(-1);
    if (
      last &&
      !last.href &&
      !span.href &&
      Boolean(last.bold) === Boolean(span.bold) &&
      Boolean(last.italic) === Boolean(span.italic)
    ) {
      last.text += span.text;
    } else {
      spans.push(span);
    }
  };
  const marks = (bold: boolean, italic: boolean) => ({
    ...(bold ? { bold: true } : {}),
    ...(italic ? { italic: true } : {}),
  });

  const pattern = /\\([*[\]\\])|\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    push({ text: text.slice(index, match.index) });
    const [, escaped, bold, italic, label, href] = match;
    if (escaped !== undefined) push({ text: escaped });
    else if (bold !== undefined) push({ text: bold, ...marks(true, false) });
    else if (italic !== undefined) push({ text: italic, ...marks(false, true) });
    else if (label !== undefined && href !== undefined) {
      const reason = unsafeUrlReason(href);
      if (reason) push({ text: label });
      else spans.push({ text: label, href: new URL(href).toString() });
    }
    index = match.index + match[0].length;
  }
  push({ text: text.slice(index) });
  return spans;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([*[\]\\])/g, '\\$1');
}

/** The inverse of parseInlineMarkdown, for loading stored spans into the editor. */
export function toInlineMarkdown(spans: readonly InlineSpan[]): string {
  return spans
    .map((span) => {
      let text = escapeMarkdown(span.text);
      if (span.href) return `[${text}](${span.href})`;
      if (span.italic) text = `*${text}*`;
      if (span.bold) text = `**${text}**`;
      return text;
    })
    .join('');
}

/** Plain text of a rich text value (for search, previews and screen-reader labels). */
export function richTextToPlain(spans: readonly InlineSpan[]): string {
  return spans.map((span) => span.text).join('');
}
