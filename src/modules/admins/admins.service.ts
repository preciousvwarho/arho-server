import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  Admin,
  AdminPermission,
  AdminRole,
  NotificationType,
} from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { paginationMeta, PaginationQuery } from '../../common/types/pagination';
import { generateReference } from '../../common/utils/generate-reference';
import { PrismaService } from '../../database/prisma.service';
import { QueuesService } from '../../queues/queues.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { SchedulePickupDto } from './dto/schedule-pickup.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';

@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly notifications: NotificationsService,
    private readonly queues: QueuesService,
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
    return { token, admin: this.toProfile(admin) };
  }

  async getMe(id: string) {
    return this.toProfile(
      await this.prisma.admin.findUniqueOrThrow({ where: { id } }),
    );
  }

  async changePassword(id: string, dto: ChangeAdminPasswordDto) {
    const admin = await this.prisma.admin.findUniqueOrThrow({ where: { id } });
    if (!(await compare(dto.currentPassword, admin.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.admin.update({
      where: { id },
      data: { passwordHash: await hash(dto.newPassword, 12) },
    });
    return null;
  }

  async createAdmin(dto: CreateAdminDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.admin.findFirst({
      where: { OR: [{ email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('Admin email or username already exists');
    }

    const role = dto.role ?? AdminRole.ADMIN;
    const admin = await this.prisma.admin.create({
      data: {
        fullName: dto.fullName,
        email,
        username: dto.username,
        passwordHash: await hash(dto.password, 12),
        role,
        permissions: dto.permissions ?? this.defaultPermissions(role),
      },
    });
    return this.toProfile(admin);
  }

  async listAdmins(query: PaginationQuery) {
    const [admins, total] = await Promise.all([
      this.prisma.admin.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.admin.count(),
    ]);
    return {
      admins: admins.map((admin) => this.toProfile(admin)),
      pagination: paginationMeta(query.page, query.limit, total),
    };
  }

  async getAdmin(id: string) {
    return this.toProfile(
      await this.prisma.admin.findUniqueOrThrow({ where: { id } }),
    );
  }

  async updateAdmin(id: string, dto: UpdateAdminDto) {
    const role = dto.role;
    const admin = await this.prisma.admin.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        email: dto.email?.toLowerCase(),
        username: dto.username,
        role,
        permissions:
          dto.permissions ?? (role ? this.defaultPermissions(role) : undefined),
        ...(dto.password ? { passwordHash: await hash(dto.password, 12) } : {}),
      },
    });
    return this.toProfile(admin);
  }

  async deleteAdmin(actorId: string, id: string) {
    if (actorId === id) {
      throw new BadRequestException('You cannot delete your own admin account');
    }
    return this.toProfile(await this.prisma.admin.delete({ where: { id } }));
  }

  async toggleAdminStatus(actorId: string, id: string) {
    if (actorId === id) {
      throw new BadRequestException(
        'You cannot deactivate your own admin account',
      );
    }
    const admin = await this.prisma.admin.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.admin.update({
      where: { id },
      data: { isActive: !admin.isActive },
    });
    return this.toProfile(updated);
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

  async processDeposit(adminId: string, id: string, dto: UpdateDepositStatusDto) {
    let creditNotification:
      | { userId: string; itemName: string; pointValue: number; depositId: string }
      | undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
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
      creditNotification = {
        userId: user.id,
        itemName: deposit.itemName,
        pointValue: deposit.pointValue,
        depositId: deposit.id,
      };
      return updated;
    });

    if (creditNotification) {
      await this.notifications.notifyUserSafely({
        userId: creditNotification.userId,
        type: NotificationType.COINS_CREDITED,
        title: 'Coins credited',
        message: `${creditNotification.pointValue} coins have been credited for ${creditNotification.itemName}.`,
        data: {
          depositRequestId: creditNotification.depositId,
          itemName: creditNotification.itemName,
          pointValue: creditNotification.pointValue,
        },
      });
    }

    return updated;
  }

  async schedulePickup(id: string, dto: SchedulePickupDto) {
    const deposit = await this.prisma.depositRequest.update({
      where: { id },
      data: { scheduledPickupAt: dto.scheduledPickupAt },
      include: { user: true, item: true, location: true },
    });

    await this.notifications.notifyUserSafely({
      userId: deposit.userId,
      type: NotificationType.PICKUP_REMINDER,
      title: 'Pickup scheduled',
      message: `Your ${deposit.itemName} pickup has been scheduled for ${dto.scheduledPickupAt.toISOString()}.`,
      data: {
        depositRequestId: deposit.id,
        scheduledPickupAt: dto.scheduledPickupAt.toISOString(),
        itemName: deposit.itemName,
      },
    });

    const reminderAt = new Date(dto.scheduledPickupAt.getTime() - 24 * 60 * 60 * 1000);
    if (reminderAt > new Date()) {
      await this.queues
        .enqueuePickupReminder({
          userId: deposit.userId,
          depositRequestId: deposit.id,
          scheduledPickupAt: reminderAt.toISOString(),
          itemName: deposit.itemName,
        })
        .catch(() => undefined);
    }

    return deposit;
  }

  async markPickupArrived(id: string) {
    const deposit = await this.prisma.depositRequest.update({
      where: { id },
      data: {
        pickupArrivedAt: new Date(),
        status: 'IN_PROGRESS',
      },
      include: { user: true, item: true, location: true },
    });

    await this.notifications.notifyUserSafely({
      userId: deposit.userId,
      type: NotificationType.PICKUP_ARRIVAL,
      title: 'Pickup team has arrived',
      message: `Our team has arrived at your pickup location for ${deposit.itemName}.`,
      data: {
        depositRequestId: deposit.id,
        itemName: deposit.itemName,
        pickupArrivedAt: deposit.pickupArrivedAt?.toISOString(),
      },
    });

    return deposit;
  }

  broadcastNotification(dto: BroadcastNotificationDto) {
    return this.notifications.broadcast({
      title: dto.title,
      message: dto.message,
      userIds: dto.userIds,
      data: dto.data,
    });
  }

  async listUsers(query: ListUsersQuery) {
    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          pointBalance: true,
          role: true,
          isEmailVerified: true,
          isActive: true,
          createdAt: true,
          country: true,
          state: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      users,
      pagination: paginationMeta(query.page, query.limit, total),
    };
  }

  async toggleUserStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        pointBalance: true,
        role: true,
        isActive: true,
      },
    });
  }

  async getSystemStats() {
    const [
      totalUsers,
      activeUsers,
      pendingDeposits,
      totalDeposits,
      totalTransactions,
      totalPoints,
      totalItems,
      activeItems,
      totalAdmins,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.depositRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.depositRequest.count(),
      this.prisma.transaction.count(),
      this.prisma.user.aggregate({ _sum: { pointBalance: true } }),
      this.prisma.item.count(),
      this.prisma.item.count({ where: { isActive: true } }),
      this.prisma.admin.count(),
    ]);
    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
      },
      deposits: {
        total: totalDeposits,
        pending: pendingDeposits,
        processed: totalDeposits - pendingDeposits,
      },
      transactions: { total: totalTransactions },
      items: { total: totalItems, active: activeItems },
      admins: { total: totalAdmins },
      system: {
        totalPointsInCirculation: totalPoints._sum.pointBalance ?? 0,
      },
    };
  }

  private defaultPermissions(role: AdminRole) {
    switch (role) {
      case AdminRole.SUPER_ADMIN:
        return [
          AdminPermission.MANAGE_USERS,
          AdminPermission.MANAGE_DEPOSITS,
          AdminPermission.MANAGE_LOCATIONS,
          AdminPermission.VIEW_ANALYTICS,
          AdminPermission.MANAGE_ADMINS,
          AdminPermission.SYSTEM_SETTINGS,
        ];
      case AdminRole.MODERATOR:
        return [
          AdminPermission.MANAGE_DEPOSITS,
          AdminPermission.VIEW_ANALYTICS,
        ];
      case AdminRole.ADMIN:
      default:
        return [
          AdminPermission.MANAGE_USERS,
          AdminPermission.MANAGE_DEPOSITS,
          AdminPermission.MANAGE_LOCATIONS,
          AdminPermission.VIEW_ANALYTICS,
        ];
    }
  }

  private toProfile(admin: Admin) {
    return {
      id: admin.id,
      fullName: admin.fullName,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      permissions: admin.permissions,
      isActive: admin.isActive,
      avatar: admin.avatar,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    };
  }
}
