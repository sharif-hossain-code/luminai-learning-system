import type { EmailMessage } from './email.transport.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(
  title: string,
  paragraphs: string[],
  action?: { label: string; url: string },
): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#2563EB;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;color:#5B6B82">If the button doesn't work, copy this link into your browser:<br>${escapeHtml(action.url)}</p>`
    : '';
  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;color:#172033;background:#F5F7FB;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
<h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}${button}
<p style="margin:24px 0 0;font-size:13px;color:#5B6B82">Luminai Learning System</p></div></body></html>`;
}

function name(displayName: string | null | undefined): string {
  return displayName ? `Hi ${displayName},` : 'Hi,';
}

export function verificationEmail(
  to: string,
  displayName: string | null,
  url: string,
  hours: number,
): EmailMessage {
  const lines = [
    name(displayName),
    'Confirm your email address to finish setting up your Luminai account.',
    `This link works once and expires in ${hours} hours.`,
    "If you didn't create an account, you can ignore this email.",
  ];
  return {
    to,
    subject: 'Confirm your email for Luminai',
    text: `${lines.join('\n\n')}\n\nConfirm your email: ${url}\n`,
    html: layout('Confirm your email', lines, { label: 'Confirm email', url }),
  };
}

export function passwordResetEmail(
  to: string,
  displayName: string | null,
  url: string,
  minutes: number,
): EmailMessage {
  const lines = [
    name(displayName),
    'We received a request to reset your Luminai password.',
    `This link works once and expires in ${minutes} minutes. Resetting signs you out on every device.`,
    "If you didn't ask for this, you can ignore this email. Your password won't change.",
  ];
  return {
    to,
    subject: 'Reset your Luminai password',
    text: `${lines.join('\n\n')}\n\nReset your password: ${url}\n`,
    html: layout('Reset your password', lines, { label: 'Reset password', url }),
  };
}

export function accountExistsEmail(
  to: string,
  displayName: string | null,
  signInUrl: string,
  resetUrl: string,
): EmailMessage {
  const lines = [
    name(displayName),
    'Someone tried to create a Luminai account with this email address, but you already have one.',
    `You can sign in at ${signInUrl}, or reset your password at ${resetUrl} if you've forgotten it.`,
    "If this wasn't you, you can ignore this email.",
  ];
  return {
    to,
    subject: 'You already have a Luminai account',
    text: `${lines.join('\n\n')}\n`,
    html: layout('You already have an account', lines, { label: 'Sign in', url: signInUrl }),
  };
}

export function passwordChangedEmail(
  to: string,
  displayName: string | null,
  resetUrl: string,
): EmailMessage {
  const lines = [
    name(displayName),
    'Your Luminai password was just changed, and your other sessions were signed out.',
    `If this wasn't you, reset your password now at ${resetUrl} and contact support.`,
  ];
  return {
    to,
    subject: 'Your Luminai password was changed',
    text: `${lines.join('\n\n')}\n`,
    html: layout('Your password was changed', lines),
  };
}
