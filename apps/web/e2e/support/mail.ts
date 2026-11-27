import { expect } from '@playwright/test';

const MAIL_SINK_URL = 'http://127.0.0.1:3125';

interface Message {
  to: string[];
  subject: string;
  text: string;
}

/** Waits for the newest email to `to` containing `path?token=...` and returns that link's path. */
export async function linkFromEmail(
  to: string,
  path: '/verify-email' | '/reset-password',
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(`${MAIL_SINK_URL}/messages?to=${encodeURIComponent(to)}`);
        const messages = (await response.json()) as Message[];
        for (const message of [...messages].reverse()) {
          const match = new RegExp(`https?://[^\\s"<>]+(${path}\\?token=[A-Za-z0-9_-]+)`).exec(
            message.text,
          );
          if (match?.[1]) {
            link = match[1];
            return true;
          }
        }
        return false;
      },
      { timeout: 15_000, message: `waiting for an email with ${path} to ${to}` },
    )
    .toBe(true);
  return link as string;
}

let counter = 0;

/** A unique address per call, so parallel tests never share an account. */
export function uniqueEmail(label: string, project: string): string {
  counter += 1;
  return `e2e.${label}.${project}.${Date.now().toString(36)}.${counter}@example.test`;
}

export const STRONG_PASSWORD = 'correct horse battery staple';
