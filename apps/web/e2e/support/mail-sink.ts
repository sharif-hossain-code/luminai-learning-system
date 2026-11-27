/**
 * Test-only mail sink for the end-to-end suite: an SMTP server that keeps messages in
 * memory and a small HTTP endpoint the tests read them from. Never used outside tests.
 *
 *   SMTP  localhost:1125  (the API's SMTP_URL during e2e)
 *   HTTP  localhost:3125/messages?to=<address>  → [{ to, subject, text }] newest last
 */
import { createServer } from 'node:http';
import { SMTPServer } from 'smtp-server';

const SMTP_PORT = Number(process.env.MAIL_SINK_SMTP_PORT ?? 1125);
const HTTP_PORT = Number(process.env.MAIL_SINK_HTTP_PORT ?? 3125);

interface Message {
  to: string[];
  subject: string;
  text: string;
}

const messages: Message[] = [];

/** Undoes quoted-printable soft line breaks and escapes so links can be read back. */
function decodeQuotedPrintable(value: string): string {
  return value
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  logger: false,
  onData(stream, session, callback) {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const subject = /^Subject: (.*)$/im.exec(raw)?.[1]?.trim() ?? '';
      messages.push({
        to: session.envelope.rcptTo.map((rcpt) => rcpt.address.toLowerCase()),
        subject,
        text: decodeQuotedPrintable(raw),
      });
      callback();
    });
  },
});

smtp.listen(SMTP_PORT, '127.0.0.1');

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${HTTP_PORT}`);
  if (url.pathname === '/health') {
    response.writeHead(200).end('ok');
    return;
  }
  if (url.pathname === '/messages') {
    const to = url.searchParams.get('to')?.toLowerCase();
    const found = to ? messages.filter((message) => message.to.includes(to)) : messages;
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(found));
    return;
  }
  response.writeHead(404).end();
}).listen(HTTP_PORT, '127.0.0.1');
