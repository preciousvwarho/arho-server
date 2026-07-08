import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NotificationType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePinDto, UpdatePinDto } from './dto/pin.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

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

    const { password, ...profile } = dto;
    const user = await this.prisma.user.create({
      data: {
        ...profile,
        email,
        passwordHash: await this.hashSecret(password),
      },
    });

    await Promise.all([
      this.sendWelcomeEmail(user.email, user.fullName).catch((error: unknown) => {
        console.error('Unable to send welcome email', error);
      }),
      this.notifications.notifyUserSafely({
        userId: user.id,
        type: NotificationType.WELCOME,
        title: 'Welcome to Trash4Cash',
        message:
          'Your Trash4Cash account has been created successfully. Start recycling and earning points.',
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
    return hash(value, this.config.get<number>('BCRYPT_SALT_ROUNDS', 12));
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
    return this.config.get<TokenTtl>('JWT_EXPIRE', '15m');
  }

  private get refreshTokenTtl(): TokenTtl {
    return this.config.get<TokenTtl>('JWT_REFRESH_EXPIRES_IN', '30d');
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
      subject: 'Welcome to Trash4Cash',
      fallbackMessage: `Welcome email for ${email}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Welcome to Trash4Cash</h2>
          <p>Hello ${fullName},</p>
          <p>Your account has been created successfully.</p>
          <p>You can now submit recyclable pickup requests and earn points.</p>
        </div>
      `,
    });
  }
}
