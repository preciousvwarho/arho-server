import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import nodemailer from 'nodemailer';

type EmailProvider = 'smtp' | 'brevo';

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fallbackMessage?: string;
};

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}

  async send(args: SendEmailArgs) {
    if (this.provider === 'brevo') {
      return this.sendWithBrevo(args);
    }

    return this.sendWithSmtp(args);
  }

  private async sendWithSmtp(args: SendEmailArgs) {
    const host = this.config.get<string>('EMAIL_HOST');
    const user = this.config.get<string>('EMAIL_USER');
    const password = this.config.get<string>('EMAIL_PASSWORD');

    if (!host || !user || !password) {
      this.logFallback(args);
      return;
    }

    const port = this.config.get<number>('EMAIL_PORT', 587);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
    });

    const result = await transporter.sendMail({
      from: this.fromEmail,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });

    if (!result.messageId) {
      throw new InternalServerErrorException('Unable to send email');
    }
  }

  private async sendWithBrevo(args: SendEmailArgs) {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    const senderEmail = this.fromEmail;

    if (!apiKey || !senderEmail) {
      this.logFallback(args);
      return;
    }

    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: this.config.get<string>('BREVO_USER', 'Trash4Cash'),
          email: senderEmail,
        },
        to: [{ email: args.to }],
        subject: args.subject,
        htmlContent: args.html,
        textContent: args.text,
      },
      {
        headers: {
          accept: 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
      },
    );
  }

  private get provider(): EmailProvider {
    const provider = this.config
      .get<string>('EMAIL_PROVIDER', 'smtp')
      .toLowerCase();

    return provider === 'brevo' ? 'brevo' : 'smtp';
  }

  private get fromEmail() {
    return this.config.get<string>('EMAIL_FROM', 'noreply@trash4cash.com');
  }

  private logFallback(args: SendEmailArgs) {
    console.log(args.fallbackMessage ?? `Email to ${args.to}: ${args.subject}`);
  }
}