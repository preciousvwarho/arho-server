import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import nodemailer from 'nodemailer';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async sendOtp(dto: SendOtpDto) {
    const email = dto.email.toLowerCase();
    const existingOtp = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingOtp) {
      const secondsSinceLastOtp =
        (Date.now() - existingOtp.createdAt.getTime()) / 1000;
      if (secondsSinceLastOtp < 60) {
        throw new HttpException(
          `Please wait ${Math.ceil(60 - secondsSinceLastOtp)} seconds before requesting another OTP`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const otp = this.generateOtp();
    await this.prisma.emailVerification.deleteMany({ where: { email } });
    await this.prisma.emailVerification.create({
      data: {
        email,
        otpHash: await hash(otp, this.config.get<number>('BCRYPT_ROUNDS', 12)),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await this.deliverOtp(email, otp, dto.fullName);
    return {
      status: 'success',
      message: 'OTP sent successfully',
      data: { email, expiresIn: '10 minutes' },
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase();
    const otpRecord = await this.prisma.emailVerification.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
    if (!otpRecord) {
      throw new BadRequestException('No OTP found for this email');
    }
    if (otpRecord.expiresAt < new Date()) {
      await this.prisma.emailVerification.delete({
        where: { id: otpRecord.id },
      });
      throw new BadRequestException('OTP has expired');
    }
    if (otpRecord.attempts >= 5) {
      await this.prisma.emailVerification.delete({
        where: { id: otpRecord.id },
      });
      throw new BadRequestException(
        'Too many failed attempts. Request a new OTP.',
      );
    }

    const valid = await compare(dto.otp, otpRecord.otpHash);
    if (!valid) {
      const updated = await this.prisma.emailVerification.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(
        `Invalid OTP. ${Math.max(0, 5 - updated.attempts)} attempts remaining.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { email },
        data: { isEmailVerified: true },
      }),
      this.prisma.emailVerification.delete({ where: { id: otpRecord.id } }),
    ]);

    return {
      status: 'success',
      message: 'Email verified successfully',
      data: { email, isEmailVerified: true },
    };
  }

  private generateOtp() {
    let otp = '';
    for (let index = 0; index < 6; index += 1) {
      otp += randomInt(0, 10).toString();
    }
    return otp;
  }

  private async deliverOtp(email: string, otp: string, fullName?: string) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');

    if (!host || !user || !password) {
      console.log(`OTP for ${email}: ${otp}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<number>('SMTP_PORT', 587) === 465,
      auth: { user, pass: password },
    });

    const result = await transporter.sendMail({
      from: this.config.get<string>('EMAIL_FROM', 'noreply@trash4cash.com'),
      to: email,
      subject: 'Trash4Cash Email Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Email Verification</h2>
          <p>Hello ${fullName ?? 'there'},</p>
          <p>Use this OTP to verify your email address:</p>
          <h1 style="letter-spacing: 4px;">${otp}</h1>
          <p>This code expires in 10 minutes.</p>
        </div>
      `,
    });

    if (!result.messageId) {
      throw new InternalServerErrorException('Unable to send OTP email');
    }
  }
}
