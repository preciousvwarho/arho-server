import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../database/prisma.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async sendOtp(dto: SendOtpDto) {
    return this.sendPurposeOtp({
      email: dto.email,
      fullName: dto.fullName,
      purpose: OtpPurpose.EMAIL_VERIFICATION,
      subject: 'Arho Email Verification',
      heading: 'Email Verification',
      intro: 'Use this OTP to verify your email address:',
    });
  }

  async sendPurposeOtp(args: {
    email: string;
    purpose: OtpPurpose;
    subject: string;
    heading: string;
    intro: string;
    fullName?: string;
  }) {
    const email = args.email.toLowerCase();
    const existingOtp = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        purpose: args.purpose,
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
    await this.prisma.emailVerification.deleteMany({
      where: { email, purpose: args.purpose },
    });
    await this.prisma.emailVerification.create({
      data: {
        email,
        purpose: args.purpose,
        otpHash: await hash(
          otp,
          Number(this.config.get<string>('BCRYPT_SALT_ROUNDS') || 12),
        ),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await this.deliverOtp({
      email,
      otp,
      fullName: args.fullName,
      subject: args.subject,
      heading: args.heading,
      intro: args.intro,
    });
    return { email, expiresIn: '10 minutes' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    return this.verifyPurposeOtp({
      email: dto.email,
      otp: dto.otp,
      purpose: OtpPurpose.EMAIL_VERIFICATION,
      markEmailVerified: true,
    });
  }

  async verifyPurposeOtp(args: {
    email: string;
    otp: string;
    purpose: OtpPurpose;
    markEmailVerified?: boolean;
  }) {
    const email = args.email.toLowerCase();
    const otpRecord = await this.prisma.emailVerification.findFirst({
      where: { email, purpose: args.purpose },
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

    const valid = await compare(args.otp, otpRecord.otpHash);
    if (!valid) {
      const updated = await this.prisma.emailVerification.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(
        `Invalid OTP. ${Math.max(0, 5 - updated.attempts)} attempts remaining.`,
      );
    }

    if (args.markEmailVerified) {
      await this.prisma.$transaction([
        this.prisma.user.updateMany({
          where: { email },
          data: { isEmailVerified: true },
        }),
        this.prisma.emailVerification.delete({ where: { id: otpRecord.id } }),
      ]);
    } else {
      await this.prisma.emailVerification.delete({
        where: { id: otpRecord.id },
      });
    }

    return { email, isEmailVerified: true };
  }

  private generateOtp() {
    let otp = '';
    for (let index = 0; index < 6; index += 1) {
      otp += randomInt(0, 10).toString();
    }
    return otp;
  }

  private async deliverOtp(args: {
    email: string;
    otp: string;
    subject: string;
    heading: string;
    intro: string;
    fullName?: string;
  }) {
    await this.email.send({
      to: args.email,
      subject: args.subject,
      fallbackMessage: `OTP for ${args.email}: ${args.otp}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>${args.heading}</h2>
          <p>Hello ${args.fullName ?? 'there'},</p>
          <p>${args.intro}</p>
          <h1 style="letter-spacing: 4px;">${args.otp}</h1>
          <p>This code expires in 10 minutes.</p>
        </div>
      `,
    });
  }
}
