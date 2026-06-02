import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../../common/types/authenticated-request';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Invalid admin token');
    }
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
    });
    if (
      !admin?.isActive ||
      (admin.lockedUntil && admin.lockedUntil > new Date())
    ) {
      throw new UnauthorizedException('Admin account is not available');
    }
    return {
      sub: admin.id,
      type: 'admin' as const,
      permissions: admin.permissions,
    };
  }
}
