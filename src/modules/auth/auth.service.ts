import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NotificationType, OtpPurpose, ReferralStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailVerificationService } from '../email-verification/email-verification.service';
import { FirebaseAuthService } from './firebase-auth.service';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { CreatePinDto, UpdatePinDto } from './dto/pin.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';
import { ResetPinDto } from './dto/reset-pin.dto';

type RefreshTokenPayload = {
  sub: string;
  sid: string;
  type: 'refresh';
};

type TokenTtl = `${number}${'s' | 'm' | 'h' | 'd'}`;

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly emailVerification: EmailVerificationService,
    private readonly firebaseAuth: FirebaseAuthService,
  ) {
    this.googleClient = new OAuth2Client(
      config.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phoneNumber: dto.phoneNumber }] },
    });
    if (existing) {
      throw new ConflictException(
        'Email or phone number is already registered',
      );
    }

    const { password, referralCode: providedReferralCode, ...profile } = dto;
    const normalizedReferralCode = providedReferralCode?.trim().toUpperCase();
    const referrer = normalizedReferralCode
      ? await this.prisma.user.findFirst({
          where: { referralCode: normalizedReferralCode, isActive: true },
          select: { id: true, referralCode: true },
        })
      : null;
    if (normalizedReferralCode && !referrer) {
      throw new BadRequestException('Invalid referral code');
    }

    const [passwordHash, userReferralCode] = await Promise.all([
      this.hashSecret(password),
      this.generateReferralCode(),
    ]);
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          ...profile,
          email,
          referralCode: userReferralCode,
          passwordHash,
        },
      });

      if (referrer) {
        await tx.referral.create({
          data: {
            referrerId: referrer.id,
            referredUserId: createdUser.id,
            referralCode: referrer.referralCode ?? normalizedReferralCode!,
            status: ReferralStatus.COMPLETED,
          },
        });
      }

      return createdUser;
    });

    await Promise.all([
      this.sendWelcomeEmail(user.email, user.fullName).catch(
        (error: unknown) => {
          console.error('Unable to send welcome email', error);
        },
      ),
      this.notifications.notifyUserSafely({
        userId: user.id,
        type: NotificationType.WELCOME,
        title: 'Welcome to Arho',
        message:
          'Your Arho account has been created successfully. Start recycling and earning points.',
        data: { userId: user.id },
      }),
    ]);

    return this.authResponse(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.authResponse(user.id);
  }

  async googleLogin(dto: GoogleLoginDto) {
    const googleClientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!googleClientId) {
      throw new UnauthorizedException('Google login is not configured');
    }
    const ticket = await this.googleClient.verifyIdToken({
      idToken: dto.idToken,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    if (!email) {
      throw new UnauthorizedException('Google account has no email address');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return {
        requiresRegistration: true,
        profile: {
          fullName: payload?.name,
          email,
          avatar: payload?.picture,
        },
      };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        isEmailVerified:
          user.isEmailVerified || Boolean(payload?.email_verified),
      },
    });
    return this.authResponse(user.id);
  }

  async firebaseLogin(dto: FirebaseLoginDto) {
    const payload = await this.firebaseAuth.verifyIdToken(dto.idToken);
    const email = payload.email?.toLowerCase();
    if (!email) {
      throw new UnauthorizedException('Firebase account has no email address');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return {
        requiresRegistration: true,
        profile: {
          fullName: payload.name,
          email,
          avatar: payload.picture,
        },
      };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        isEmailVerified:
          user.isEmailVerified || Boolean(payload.email_verified),
      },
    });
    return this.authResponse(user.id);
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive ||
      !(await compare(refreshToken, session.tokenHash))
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), rotatedAt: new Date() },
    });

    return this.authResponse(session.userId);
  }

  async logout(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    await this.prisma.refreshSession.updateMany({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.isActive) {
      await this.emailVerification.sendPurposeOtp({
        email,
        fullName: user.fullName,
        purpose: OtpPurpose.PASSWORD_RESET,
        subject: 'Arho Password Reset',
        heading: 'Password Reset',
        intro: 'Use this OTP to reset your password:',
      });
    }

    return { email, expiresIn: '10 minutes' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid password reset request');
    }

    await this.emailVerification.verifyPurposeOtp({
      email,
      otp: dto.otp,
      purpose: OtpPurpose.PASSWORD_RESET,
    });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.hashSecret(dto.newPassword) },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return null;
  }

  async createPin(userId: string, dto: CreatePinDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.transactionPinHash) {
      throw new BadRequestException('PIN already exists. Use update instead.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        transactionPinHash: await this.hashSecret(dto.pin),
        registrationStage: 2,
      },
    });
    return null;
  }

  async updatePin(userId: string, dto: UpdatePinDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (
      !user.transactionPinHash ||
      !(await compare(dto.oldPin, user.transactionPinHash))
    ) {
      throw new UnauthorizedException('Old PIN is incorrect');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { transactionPinHash: await this.hashSecret(dto.newPin) },
    });
    return null;
  }

  async forgotPin(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, fullName: true, isActive: true },
    });
    if (!user.isActive) {
      throw new UnauthorizedException('User account is not available');
    }

    await this.emailVerification.sendPurposeOtp({
      email: user.email,
      fullName: user.fullName,
      purpose: OtpPurpose.PIN_RESET,
      subject: 'Arho Transaction PIN Reset',
      heading: 'Transaction PIN Reset',
      intro: 'Use this OTP to reset your transaction PIN:',
    });

    return { email: user.email, expiresIn: '10 minutes' };
  }

  async resetPin(userId: string, dto: ResetPinDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, isActive: true },
    });
    if (!user.isActive) {
      throw new UnauthorizedException('User account is not available');
    }

    await this.emailVerification.verifyPurposeOtp({
      email: user.email,
      otp: dto.otp,
      purpose: OtpPurpose.PIN_RESET,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        transactionPinHash: await this.hashSecret(dto.newPin),
        registrationStage: 2,
      },
    });

    return null;
  }

  async verifyPin(userId: string, pin: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (
      !user.transactionPinHash ||
      !(await compare(pin, user.transactionPinHash))
    ) {
      throw new UnauthorizedException('Incorrect transaction PIN');
    }
    return user;
  }

  private async authResponse(userId: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, type: 'user' },
      { expiresIn: this.accessTokenTtl },
    );
    const refreshToken = await this.createRefreshToken(userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        pointBalance: true,
        referralCode: true,
        registrationStage: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        country: true,
        state: true,
      },
    });
    return { accessToken, refreshToken, token: accessToken, user };
  }

  private hashSecret(value: string) {
    return hash(
      value,
      Number(this.config.get<string>('BCRYPT_SALT_ROUNDS') || 12),
    );
  }

  private async generateReferralCode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const referralCode = `T4C${randomBytes(4).toString('hex').toUpperCase()}`;
      const existing = await this.prisma.user.findFirst({
        where: { referralCode },
        select: { id: true },
      });
      if (!existing) {
        return referralCode;
      }
    }

    throw new Error('Unable to generate a unique referral code');
  }

  private async createRefreshToken(userId: string) {
    const sessionId = randomBytes(12).toString('hex');
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId, type: 'refresh' },
      { expiresIn: this.refreshTokenTtl },
    );

    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId,
        tokenHash: await this.hashSecret(refreshToken),
        expiresAt: this.dateFromNow(this.refreshTokenTtl),
      },
    });

    return refreshToken;
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.config.getOrThrow<string>('JWT_SECRET'),
        },
      );
      if (payload.type !== 'refresh' || !payload.sid || !payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private get accessTokenTtl(): TokenTtl {
    return (this.config.get<string>('JWT_EXPIRE') || '15m') as TokenTtl;
  }

  private get refreshTokenTtl(): TokenTtl {
    return (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ||
      '30d') as TokenTtl;
  }

  private dateFromNow(ttl: TokenTtl) {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Unsupported token TTL format: ${ttl}`);
    }

    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }

  private async sendWelcomeEmail(email: string, fullName: string) {
    await this.email.send({
      to: email,
      subject: 'Welcome to Arho',
      fallbackMessage: `Welcome email for ${email}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Welcome to Arho</h2>
          <p>Hello ${fullName},</p>
          <p>Your account has been created successfully.</p>
          <p>You can now submit recyclable pickup requests and earn points.</p>
        </div>
      `,
    });
  }
}
