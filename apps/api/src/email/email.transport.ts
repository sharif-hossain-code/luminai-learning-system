import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/** SMTP delivery. Locally this is Mailpit (docker compose); in production, the chosen provider's SMTP relay. */
@Injectable()
export class SmtpEmailTransport implements EmailTransport, OnModuleDestroy {
  private readonly transporter: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    if (!config.SMTP_URL) throw new Error('SMTP_URL is not configured');
    this.transporter = nodemailer.createTransport(config.SMTP_URL);
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.config.EMAIL_FROM, ...message });
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}

/** Keeps messages in memory. Test-only (config validation forbids it in production). */
@Injectable()
export class MemoryEmailTransport implements EmailTransport {
  readonly outbox: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
    return Promise.resolve();
  }

  /** Latest message for an address. */
  lastTo(to: string): EmailMessage | undefined {
    return this.outbox.findLast((message) => message.to === to);
  }
}
