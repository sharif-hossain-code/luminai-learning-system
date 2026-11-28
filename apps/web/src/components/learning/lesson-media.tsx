'use client';

import type { LearnerResource, LessonType } from '@luminai/contracts';
import { ExternalLink, FileText } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useLessonProgress } from './lesson-progress';

const MEDIA_FILE = /\.(mp4|webm|ogv|ogg|mov|m4v|mp3|m4a|aac|oga|wav|flac)(\?.*)?$/i;
const SAVE_EVERY_SECONDS = 15;

/** Media the browser can play itself (a direct file), so progress can be tracked. */
export function isPlayable(resource: LearnerResource): boolean {
  if (!resource.url) return false;
  if (resource.mimeType) return /^(video|audio)\//.test(resource.mimeType);
  try {
    return MEDIA_FILE.test(new URL(resource.url).pathname);
  } catch {
    return false;
  }
}

/**
 * The video or audio of a lesson. Saves the position every few seconds, on pause
 * and at the end, and resumes where the learner left off (on any device).
 * Media hosted elsewhere (a page, not a file) opens in a new tab instead.
 */
export function LessonMedia({
  type,
  media,
  captions,
  transcript,
}: {
  type: LessonType;
  media: LearnerResource;
  captions: LearnerResource | undefined;
  transcript: LearnerResource | undefined;
}) {
  const { progress, save } = useLessonProgress();
  const element = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const lastSaved = useRef(0);
  const resumeAt = useRef(progress.positionSeconds ?? 0);

  const report = useCallback(
    (force: boolean) => {
      const player = element.current;
      if (!player || !Number.isFinite(player.duration) || player.duration <= 0) return;
      const position = Math.floor(player.currentTime);
      if (!force && Math.abs(position - lastSaved.current) < SAVE_EVERY_SECONDS) return;
      lastSaved.current = position;
      const percent = player.ended ? 100 : Math.floor((player.currentTime / player.duration) * 100);
      save({ positionSeconds: position, progressPercent: percent }).catch(() => undefined);
    },
    [save],
  );

  useEffect(() => {
    const player = element.current;
    // Save the position if the learner leaves mid-way.
    return () => {
      if (player && !player.paused) report(true);
    };
  }, [report]);

  if (!isPlayable(media)) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-subtle bg-surface p-6">
        <p className="text-support text-fg-muted">
          This {type === 'AUDIO' ? 'recording' : 'video'} plays on another site.
        </p>
        <a
          href={media.url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 font-semibold text-primary-fg hover:bg-primary-hover"
        >
          Open {media.title}
          <ExternalLink aria-hidden className="size-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        {transcript?.url ? <TranscriptLink transcript={transcript} /> : null}
      </div>
    );
  }

  const shared = {
    ref: element,
    src: media.url!,
    controls: true,
    preload: 'metadata' as const,
    onLoadedMetadata: () => {
      const player = element.current;
      if (player && resumeAt.current > 0 && resumeAt.current < player.duration - 5) {
        player.currentTime = resumeAt.current;
        lastSaved.current = resumeAt.current;
      }
    },
    onTimeUpdate: () => report(false),
    onPause: () => report(true),
    onEnded: () => report(true),
  };

  return (
    <div className="flex flex-col gap-3">
      {type === 'AUDIO' ? (
        <div className="rounded-lg border border-subtle bg-surface p-5">
          <p className="mb-3 font-semibold">{media.title}</p>
          <audio {...shared} className="w-full">
            Your browser can&apos;t play this audio.
          </audio>
        </div>
      ) : (
        <video
          {...shared}
          playsInline
          crossOrigin={captions?.url ? 'anonymous' : undefined}
          className="aspect-video max-h-[420px] w-full rounded-lg bg-inverse"
        >
          {captions?.url ? (
            <track kind="captions" src={captions.url} srcLang="en" label="English" default />
          ) : null}
          Your browser can&apos;t play this video.
        </video>
      )}
      {transcript?.url ? <TranscriptLink transcript={transcript} /> : null}
    </div>
  );
}

function TranscriptLink({ transcript }: { transcript: LearnerResource }) {
  return (
    <a
      href={transcript.url!}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-2 rounded-sm text-support font-semibold text-primary hover:text-primary-hover"
    >
      <FileText aria-hidden className="size-4" />
      Transcript
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
