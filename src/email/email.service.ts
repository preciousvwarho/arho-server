import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';
import nodemailer from 'nodemailer';

type EmailProvider = 'smtp' | 'brevo' | 'postmark';

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fallbackMessage?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(args: SendEmailArgs) {
    if (this.provider === 'brevo') {
      return this.sendWithBrevo(args);
    }
    if (this.provider === 'postmark') {
      return this.sendWithPostmark(args);
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

    let result: Awaited<ReturnType<typeof transporter.sendMail>>;
    try {
      result = await transporter.sendMail({
        from: this.fromEmail,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      });
    } catch (error) {
      this.logger.error(
        `SMTP email send failed: ${JSON.stringify({
          to: args.to,
          subject: args.subject,
          from: this.fromEmail,
          error: error instanceof Error ? error.message : String(error),
        })}`,
      );
      throw new InternalServerErrorException(
        'Unable to send email at the moment',
      );
    }

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

    try {
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
    } catch (error) {
      this.logger.error(
        `Brevo email send failed: ${JSON.stringify({
          to: args.to,
          subject: args.subject,
          from: senderEmail,
          status: isAxiosError(error) ? error.response?.status : undefined,
          response: isAxiosError(error) ? error.response?.data : undefined,
          error: error instanceof Error ? error.message : String(error),
        })}`,
      );
      throw new InternalServerErrorException(
        'Unable to send email at the moment',
      );
    }
  }

  private async sendWithPostmark(args: SendEmailArgs) {
    const serverToken = this.config.get<string>('POSTMARK_SERVER_TOKEN');
    const senderEmail =
      this.config.get<string>('POSTMARK_EMAIL_FROM') ?? this.fromEmail;

    if (!serverToken || !senderEmail) {
      this.logFallback(args);
      return;
    }

    const senderName = this.config.get<string>('POSTMARK_EMAIL_FROM_NAME');
    const messageStream = this.config.get<string>(
      'POSTMARK_MESSAGE_STREAM',
      'outbound',
    );

    try {
      await axios.post(
        'https://api.postmarkapp.com/email',
        {
          From: senderName ? `${senderName} <${senderEmail}>` : senderEmail,
          To: args.to,
          Subject: args.subject,
          HtmlBody: args.html,
          TextBody: args.text,
          MessageStream: messageStream,
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': serverToken,
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Postmark email send failed: ${JSON.stringify({
          to: args.to,
          subject: args.subject,
          from: senderEmail,
          status: isAxiosError(error) ? error.response?.status : undefined,
          response: isAxiosError(error) ? error.response?.data : undefined,
          error: error instanceof Error ? error.message : String(error),
        })}`,
      );
      throw new InternalServerErrorException(
        'Unable to send email at the moment',
      );
    }
  }

  private get provider(): EmailProvider {
    const provider = this.config
      .get<string>('EMAIL_PROVIDER', 'smtp')
      .toLowerCase();

    if (provider === 'brevo' || provider === 'postmark') {
      return provider;
    }

    return 'smtp';
  }

  private get fromEmail() {
    return this.config.get<string>('EMAIL_FROM', 'noreply@trash4cash.com');
  }

  private logFallback(args: SendEmailArgs) {
    console.log(args.fallbackMessage ?? `Email to ${args.to}: ${args.subject}`);
  }
}
