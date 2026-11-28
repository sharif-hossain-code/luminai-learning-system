import { describe, expect, it } from 'vitest';
import { slugify, updateCourseRequestSchema } from './catalog.js';
import {
  cleanText,
  lessonContentSchema,
  parseInlineMarkdown,
  richTextToPlain,
  toInlineMarkdown,
  unsafeUrlReason,
} from './content.js';

describe('safe URL policy', () => {
  it.each(['https://www.bbc.co.uk/learningenglish', 'https://example.com/video.mp4?t=10#start'])(
    'accepts %s',
    (url) => {
      expect(unsafeUrlReason(url)).toBeNull();
    },
  );

  it.each([
    ['javascript:alert(1)', 'https'],
    ['JaVaScRiPt:alert(1)', 'https'],
    ['data:text/html,<script>alert(1)</script>', 'https'],
    ['http://example.com', 'https'],
    ['https://user:pass@example.com', 'user name'],
    ['https://localhost/admin', 'public'],
    ['https://127.0.0.1/', 'public'],
    ['https://10.0.0.5/', 'public'],
    ['https://192.168.1.1/', 'public'],
    ['https://169.254.169.254/latest/meta-data', 'public'],
    ['https://[::1]/', 'public'],
    ['https://intranet/', 'public'],
    ['not a url', 'full link'],
  ])('refuses %s', (url, reason) => {
    expect(unsafeUrlReason(url)).toMatch(new RegExp(reason, 'i'));
  });
});

describe('text hygiene', () => {
  it('removes control and bidi-override characters but keeps line breaks', () => {
    expect(cleanText('a\u0000b‮c\r\nd⁦e')).toBe('abc\nde');
  });

  it('normalises plain-text fields', () => {
    const parsed = updateCourseRequestSchema.parse({
      title: '  Public \u0007 speaking   essentials ',
      summary: 'Line one\r\n\r\n\r\n\r\nLine two   ',
    });
    expect(parsed.title).toBe('Public speaking essentials');
    expect(parsed.summary).toBe('Line one\n\nLine two');
  });
});

describe('lesson content schema', () => {
  it('accepts every block type', () => {
    const parsed = lessonContentSchema.safeParse({
      schemaVersion: 1,
      blocks: [
        { type: 'heading', level: 2, text: 'Why pauses matter' },
        { type: 'paragraph', content: [{ text: 'A ' }, { text: 'pause', bold: true }] },
        { type: 'list', style: 'bullet', items: [[{ text: 'One' }], [{ text: 'Two' }]] },
        { type: 'callout', tone: 'tip', title: 'Try it', content: [{ text: 'Breathe.' }] },
        { type: 'quote', content: [{ text: 'Less is more.' }], attribution: 'Mies' },
        { type: 'example', content: [{ text: 'Good morning, everyone.' }] },
        { type: 'reflection', prompt: 'When did a pause help you?' },
        { type: 'divider' },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects raw HTML block types and unknown properties', () => {
    expect(
      lessonContentSchema.safeParse({
        schemaVersion: 1,
        blocks: [{ type: 'html', html: '<script>alert(1)</script>' }],
      }).success,
    ).toBe(false);
    expect(
      lessonContentSchema.safeParse({
        schemaVersion: 1,
        blocks: [{ type: 'paragraph', content: [{ text: 'x' }], html: '<b>x</b>' }],
      }).success,
    ).toBe(false);
  });

  it('rejects links that fail the safe URL policy', () => {
    const parsed = lessonContentSchema.safeParse({
      schemaVersion: 1,
      blocks: [{ type: 'paragraph', content: [{ text: 'click', href: 'javascript:alert(1)' }] }],
    });
    expect(parsed.success).toBe(false);
  });

  it('keeps HTML typed into text as literal characters', () => {
    const parsed = lessonContentSchema.parse({
      schemaVersion: 1,
      blocks: [{ type: 'paragraph', content: [{ text: '<img src=x onerror=alert(1)>' }] }],
    });
    expect(parsed.blocks[0]).toEqual({
      type: 'paragraph',
      content: [{ text: '<img src=x onerror=alert(1)>' }],
    });
  });

  it('rejects an unknown schema version', () => {
    expect(lessonContentSchema.safeParse({ schemaVersion: 2, blocks: [] }).success).toBe(false);
  });
});

describe('inline markdown', () => {
  it('parses bold, italic and safe links', () => {
    expect(
      parseInlineMarkdown('Use **short** words, *slowly*, see [the guide](https://example.com/g).'),
    ).toEqual([
      { text: 'Use ' },
      { text: 'short', bold: true },
      { text: ' words, ' },
      { text: 'slowly', italic: true },
      { text: ', see ' },
      { text: 'the guide', href: 'https://example.com/g' },
      { text: '.' },
    ]);
  });

  it('turns unsafe links into plain text and leaves HTML alone', () => {
    expect(parseInlineMarkdown('[click](javascript:alert(1)) <b>hi</b>')).toEqual([
      { text: 'click) <b>hi</b>' },
    ]);
    expect(richTextToPlain(parseInlineMarkdown('<script>alert(1)</script>'))).toBe(
      '<script>alert(1)</script>',
    );
  });

  it('round-trips through the editor format', () => {
    const source = 'A **bold** move, a *quiet* one, a [link](https://example.com/), and 2 \\* 3.';
    const spans = parseInlineMarkdown(source);
    expect(toInlineMarkdown(spans)).toBe(source);
    expect(parseInlineMarkdown(toInlineMarkdown(spans))).toEqual(spans);
  });
});

describe('slugify', () => {
  it('makes URL-safe slugs', () => {
    expect(slugify('Public speaking: the  basics!')).toBe('public-speaking-the-basics');
    expect(slugify('Café Négociation')).toBe('cafe-negociation');
    expect(slugify('***')).toBe('');
  });
});
