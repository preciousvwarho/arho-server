import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { paginationMeta, PaginationQuery } from '../../common/types/pagination';
import { generateReference } from '../../common/utils/generate-reference';
import { PrismaService } from '../../database/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';

@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: AdminLoginDto) {
    const admin = await this.prisma.admin.findFirst({
      where: {
        OR: [{ email: dto.login.toLowerCase() }, { username: dto.login }],
      },
    });
    if (!admin || !(await compare(dto.password, admin.passwordHash))) {
      throw new UnauthorizedException('Invalid login credentials');
    }
    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account has been deactivated');
    }
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date(), loginAttempts: 0, lockedUntil: null },
    });
    const token = await this.jwt.signAsync({ sub: admin.id, type: 'admin' });
    const profile = {
      id: admin.id,
      fullName: admin.fullName,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      permissions: admin.permissions,
      isActive: admin.isActive,
      avatar: admin.avatar,
      lastLoginAt: admin.lastLoginAt,
    };
    return { status: 'success', token, data: { admin: profile } };
  }

  createItem(dto: CreateItemDto) {
    return this.prisma.item.create({ data: dto });
  }

  async listDeposits(query: PaginationQuery) {
    const [deposits, total] = await Promise.all([
      this.prisma.depositRequest.findMany({
        include: { user: true, item: true, location: true, processedBy: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.depositRequest.count(),
    ]);
    return {
      deposits,
      pagination: paginationMeta(query.page, query.limit, total),
    };
  }

  processDeposit(adminId: string, id: string, dto: UpdateDepositStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.depositRequest.findUniqueOrThrow({
        where: { id },
      });
      if (deposit.status !== 'PENDING') {
        throw new BadRequestException(
          'Deposit request has already been processed',
        );
      }

      const updated = await tx.depositRequest.update({
        where: { id },
        data: {
          status: dto.status,
          adminNote: dto.adminNote,
          processedById: adminId,
          processedAt: new Date(),
        },
      });
      if (dto.status === 'REJECTED') return updated;

      const user = await tx.user.findUniqueOrThrow({
        where: { id: deposit.userId },
      });
      const balanceAfter = user.pointBalance + deposit.pointValue;
      await tx.user.update({
        where: { id: user.id },
        data: { pointBalance: balanceAfter },
      });
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: 'CREDIT',
          status: 'COMPLETED',
          amount: deposit.pointValue,
          reference: generateReference('DEPOSIT'),
          description: `Points credited for ${deposit.itemName}`,
          metadata: {
            depositRequestId: deposit.id,
            weightKg: deposit.weightKg,
          },
          balanceBefore: user.pointBalance,
          balanceAfter,
        },
      });
      return updated;
    });
  }
}
