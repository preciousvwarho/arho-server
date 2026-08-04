import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  ReferralStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { PaginationQuery, paginationMeta } from '../../common/types/pagination';
import { PrismaService } from '../../database/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PushNotificationsDto } from './dto/push-notifications.dto';
import { PushTokenDto } from './dto/push-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getProfile(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        pickupLocation: true,
        registrationStage: true,
        pointBalance: true,
        referralCode: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        pushNotificationsEnabled: true,
        createdAt: true,
        country: true,
        state: true,
      },
    });
  }

  async getDashboard(id: string) {
    const userSelect = {
      id: true,
      fullName: true,
      email: true,
      phoneNumber: true,
      pickupLocation: true,
      registrationStage: true,
      pointBalance: true,
      referralCode: true,
      role: true,
      isEmailVerified: true,
      isActive: true,
      pushNotificationsEnabled: true,
      createdAt: true,
      country: true,
      state: true,
    };
    const [
      user,
      depositStats,
      referralCount,
      recentTransactions,
      recentDeposits,
    ] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id },
        select: userSelect,
      }),
      this.prisma.depositRequest.aggregate({
        where: { userId: id, status: 'CREDITED' },
        _sum: { pointValue: true, weightKg: true },
        _count: true,
      }),
      this.prisma.referral.count({
        where: {
          referrerId: id,
          status: { in: [ReferralStatus.COMPLETED, ReferralStatus.REWARDED] },
        },
      }),
      this.prisma.transaction.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.depositRequest.findMany({
        where: { userId: id },
        include: { item: true, location: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    const totalDepositCoins = depositStats._sum.pointValue ?? 0;

    return {
      user,
      wallet: {
        coinsBalance: user.pointBalance,
        totalCoinsEarned: totalDepositCoins,
        totalRecycled: depositStats._count,
        savedCO2: null,
        referrals: referralCount,
      },
      recentTransactions,
      recentDeposits,
    };
  }

  async getActivities(id: string, query: PaginationQuery) {
    const where = { userId: id };
    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      activities: transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        title: this.activityTitle(transaction.type),
        amount: transaction.amount,
        fee: transaction.fee,
        status: transaction.status,
        statusLabel: this.activityStatusLabel(transaction.status),
        description: transaction.description,
        reference: transaction.reference,
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        metadata: transaction.metadata,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      })),
      pagination: paginationMeta(query.page, query.limit, total),
    };
  }

  updateProfile(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        pickupLocation: true,
        registrationStage: true,
        pointBalance: true,
        referralCode: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        pushNotificationsEnabled: true,
        createdAt: true,
        country: true,
        state: true,
      },
    });
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (!(await compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash: await hash(dto.newPassword, 12) },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return null;
  }

  async deleteAccount(id: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isActive: false, pushToken: null },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return null;
  }

  async setPushToken(id: string, dto: PushTokenDto) {
    await this.prisma.user.updateMany({
      where: {
        pushToken: dto.pushToken,
        id: { not: id },
      },
      data: { pushToken: null },
    });

    return this.prisma.user.update({
      where: { id },
      data: { pushToken: dto.pushToken },
      select: { pushNotificationsEnabled: true },
    });
  }

  setPushNotificationPreference(id: string, dto: PushNotificationsDto) {
    return this.prisma.user.update({
      where: { id },
      data: { pushNotificationsEnabled: dto.enabled },
      select: { pushNotificationsEnabled: true },
    });
  }

  getPushNotificationPreference(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { pushNotificationsEnabled: true },
    });
  }

  private activityTitle(type: TransactionType) {
    const titles: Record<TransactionType, string> = {
      DEPOSIT: 'Deposit credited',
      AIRTIME: 'Airtime purchase',
      DATA: 'Data purchase',
      TRANSFER: 'Funds transfer',
      CABLE: 'Cable payment',
      ELECTRICITY: 'Electricity payment',
      DEBIT: 'Wallet debit',
      CREDIT: 'Coins credited',
    };
    return titles[type];
  }

  private activityStatusLabel(status: TransactionStatus) {
    const labels: Record<TransactionStatus, string> = {
      PENDING: 'Pending',
      COMPLETED: 'Successful',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
    };
    return labels[status];
  }
}
