import {
  unsafeUrlReason,
  type ContentBlock,
  type InlineSpan,
  type LessonContent as LessonContentValue,
} from '@luminai/contracts';
import { Info, Lightbulb, MessageCircleQuestion, TriangleAlert } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '@/lib/cn';

/**
 * Renders structured lesson content with React elements only. There is no
 * dangerouslySetInnerHTML anywhere: text is always text, and links are re-checked
 * against the safe URL policy even though the API already validated them.
 */
export function RichText({ spans }: { spans: readonly InlineSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        let node: React.ReactNode = span.text;
        if (span.italic) node = <em>{node}</em>;
        if (span.bold) node = <strong className="font-semibold">{node}</strong>;
        if (span.href && unsafeUrlReason(span.href) === null) {
          node = (
            <a
              href={span.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
            >
              {node}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          );
        }
        return <Fragment key={index}>{node}</Fragment>;
      })}
    </>
  );
}

const CALLOUTS = {
  info: { icon: Info, box: 'border-primary/25 bg-primary-subtle', icon_: 'text-primary' },
  tip: { icon: Lightbulb, box: 'border-success/25 bg-success-subtle', icon_: 'text-success-text' },
  warning: {
    icon: TriangleAlert,
    box: 'border-warning/30 bg-warning-subtle',
    icon_: 'text-warning-text',
  },
} as const;

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'heading':
      return block.level === 2 ? (
        <h2 className="mt-4 text-h2 font-semibold first:mt-0">{block.text}</h2>
      ) : (
        <h3 className="mt-2 text-h3 font-semibold first:mt-0">{block.text}</h3>
      );
    case 'paragraph':
      return (
        <p className="whitespace-pre-line">
          <RichText spans={block.content} />
        </p>
      );
    case 'list': {
      const List = block.style === 'numbered' ? 'ol' : 'ul';
      return (
        <List
          className={cn(
            'flex flex-col gap-1.5 pl-6',
            block.style === 'numbered' ? 'list-decimal' : 'list-disc',
          )}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-1">
              <RichText spans={item} />
            </li>
          ))}
        </List>
      );
    }
    case 'callout': {
      const tone = CALLOUTS[block.tone];
      return (
        <aside className={cn('flex gap-3 rounded-md border p-4', tone.box)}>
          <tone.icon aria-hidden className={cn('mt-1 size-5 shrink-0', tone.icon_)} />
          <div className="min-w-0">
            {block.title ? <p className="font-semibold">{block.title}</p> : null}
            <p className="whitespace-pre-line">
              <RichText spans={block.content} />
            </p>
          </div>
        </aside>
      );
    }
    case 'quote':
      return (
        <figure className="border-l-4 border-primary/40 pl-5">
          <blockquote className="text-lg leading-8 italic">
            <RichText spans={block.content} />
          </blockquote>
          {block.attribution ? (
            <figcaption className="mt-2 text-support text-fg-muted">
              — {block.attribution}
            </figcaption>
          ) : null}
        </figure>
      );
    case 'example':
      return (
        <div className="rounded-md border border-subtle bg-surface-raised p-4">
          <p className="text-overline font-semibold tracking-wider text-fg-subtle uppercase">
            {block.title ?? 'Example'}
          </p>
          <p className="mt-1.5 whitespace-pre-line">
            <RichText spans={block.content} />
          </p>
        </div>
      );
    case 'reflection':
      return (
        <div className="flex gap-3 rounded-md border border-dashed border-secondary/40 bg-secondary-subtle p-4">
          <MessageCircleQuestion aria-hidden className="mt-1 size-5 shrink-0 text-secondary" />
          <div>
            <p className="text-overline font-semibold tracking-wider text-secondary uppercase">
              Reflect
            </p>
            <p className="mt-1">{block.prompt}</p>
          </div>
        </div>
      );
    case 'divider':
      return <hr className="my-2 border-subtle" />;
  }
}

export function LessonContent({
  content,
  className,
}: {
  content: LessonContentValue;
  className?: string;
}) {
  return (
    <div className={cn('flex max-w-[68ch] flex-col gap-4 text-base leading-7', className)}>
      {content.blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
