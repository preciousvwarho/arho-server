import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../database/prisma.service';
import { CreatePinDto, UpdatePinDto } from './dto/pin.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
        status: 'success',
        requiresRegistration: true,
        data: {
          profile: {
            fullName: payload?.name,
            email,
            avatar: payload?.picture,
          },
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
    return {
      status: 'success',
      message: 'Transaction PIN created successfully',
    };
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
    return {
      status: 'success',
      message: 'Transaction PIN updated successfully',
    };
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
    const token = await this.jwt.signAsync({ sub: userId, type: 'user' });
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
    return { status: 'success', token, data: { user } };
  }

  private hashSecret(value: string) {
    return hash(value, this.config.get<number>('BCRYPT_ROUNDS', 12));
  }
}
