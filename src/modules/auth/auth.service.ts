import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { CreatePinDto, UpdatePinDto } from './dto/pin.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

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
